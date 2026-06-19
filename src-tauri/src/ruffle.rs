use reqwest::blocking::Client;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::server::LocalServer;

const RUNTIME_PATH: &str = "/ruffle/";
const SOCKET_PATH: &str = "/ruffle-socket/";
const PROXY_PATH: &str = "/ruffle-proxy/";

#[derive(Clone)]
pub struct RuffleServer {
    ruffle_dir: PathBuf,
    client: Client,
    local_server: Option<LocalServer>,
}

#[derive(Debug, Default)]
pub(crate) struct RuffleWsState {
    next_connection_id: AtomicU64,
    connections: Mutex<HashMap<String, WsConnection>>,
}

#[derive(Clone, Debug)]
struct SocketTarget {
    host: String,
    port: u16,
}

#[derive(Debug)]
struct WsConnection {
    target: SocketTarget,
    writer: Arc<Mutex<TcpStream>>,
}

struct Response {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

pub fn create(resource_dir: PathBuf, local_server: Option<LocalServer>) -> RuffleServer {
    RuffleServer {
        ruffle_dir: resolve_runtime_dir(resource_dir).join("ruffle"),
        client: Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to create ruffle proxy client"),
        local_server,
    }
}

pub fn unavailable_protocol_response() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(503)
        .header("content-type", "text/plain; charset=utf-8")
        .body(b"ruffle server is not ready".to_vec())
        .unwrap()
}

#[tauri::command]
pub(crate) fn ruffle_register_ws<R: Runtime + 'static>(
    app: AppHandle<R>,
    url: String,
) -> Result<String, String> {
    let target = parse_socket_target(&url)?;
    let stream = connect_socket_target(&target)?;
    stream.set_nodelay(true).map_err(|err| err.to_string())?;
    let reader = stream.try_clone().map_err(|err| err.to_string())?;
    let writer = Arc::new(Mutex::new(stream));
    let state = app.state::<RuffleWsState>();
    let conn_id = format!(
        "ruffle-ws-{}",
        state.next_connection_id.fetch_add(1, Ordering::Relaxed) + 1
    );

    state
        .connections
        .lock()
        .map_err(|err| err.to_string())?
        .insert(
            conn_id.clone(),
            WsConnection {
                target: target.clone(),
                writer,
            },
        );

    println!(
        "[ruffle] WS registered {} for {} -> {}:{}",
        conn_id, url, target.host, target.port
    );
    spawn_socket_reader(app, conn_id.clone(), target, reader);
    Ok(conn_id)
}

#[tauri::command]
pub(crate) fn ruffle_ws_send<R: Runtime + 'static>(
    app: AppHandle<R>,
    conn_id: String,
    message: Vec<u8>,
) -> Result<(), String> {
    let state = app.state::<RuffleWsState>();
    let (writer, target) = {
        let connections = state.connections.lock().map_err(|err| err.to_string())?;
        let connection = connections
            .get(&conn_id)
            .ok_or_else(|| format!("unknown websocket connection: {conn_id}"))?;
        (
            Arc::clone(&connection.writer),
            format!("{}:{}", connection.target.host, connection.target.port),
        )
    };

    println!(
        "[ruffle] WS send on {} to {} ({} bytes)",
        conn_id,
        target,
        message.len()
    );

    let mut stream = writer.lock().map_err(|err| err.to_string())?;
    let write_result = stream.write_all(&message);

    if let Err(err) = write_result {
        state
            .connections
            .lock()
            .map_err(|err| err.to_string())?
            .remove(&conn_id);
        let _ = app.emit(&format!("ws_close_{conn_id}"), "write failed");
        return Err(err.to_string());
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn ruffle_ws_close<R: Runtime + 'static>(
    app: AppHandle<R>,
    conn_id: String,
) -> Result<(), String> {
    let state = app.state::<RuffleWsState>();
    let removed = state
        .connections
        .lock()
        .map_err(|err| err.to_string())?
        .remove(&conn_id);

    if let Some(connection) = removed {
        if let Ok(stream) = connection.writer.lock() {
            let _ = stream.shutdown(Shutdown::Both);
        }
        println!("[ruffle] WS close {}", conn_id);
    }

    Ok(())
}

impl RuffleServer {
    pub fn protocol_response(
        &self,
        request: tauri::http::Request<Vec<u8>>,
    ) -> tauri::http::Response<Vec<u8>> {
        let is_head = request.method() == tauri::http::Method::HEAD;
        let response = match self.handle_path(request.uri().path(), request.uri().query()) {
            Ok(response) => response,
            Err(err) => response(
                500,
                "text/plain; charset=utf-8",
                format!("ruffle server error: {err}").into_bytes(),
            ),
        };
        to_protocol_response(response, is_head)
    }

    fn handle_path(
        &self,
        path: &str,
        query: Option<&str>,
    ) -> Result<Response, Box<dyn std::error::Error + Send + Sync>> {
        if path.starts_with(SOCKET_PATH) {
            return Ok(response(
                400,
                "text/plain; charset=utf-8",
                b"websocket upgrade required".to_vec(),
            ));
        }

        if path.starts_with(PROXY_PATH) {
            return self.handle_proxy(query);
        }

        if path.starts_with(RUNTIME_PATH) {
            return self.serve_file(path);
        }

        Ok(response(
            403,
            "text/plain; charset=utf-8",
            b"not a ruffle path".to_vec(),
        ))
    }

    fn serve_file(
        &self,
        url_path: &str,
    ) -> Result<Response, Box<dyn std::error::Error + Send + Sync>> {
        let file_name = url_path.trim_start_matches(RUNTIME_PATH);
        if file_name.is_empty() {
            return Ok(response(
                403,
                "text/plain; charset=utf-8",
                b"not a valid ruffle path".to_vec(),
            ));
        }

        let relative = Path::new(file_name);
        if relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Ok(response(
                403,
                "text/plain; charset=utf-8",
                b"not a valid ruffle path".to_vec(),
            ));
        }

        let file_path = self.ruffle_dir.join(relative);

        #[cfg(mobile)]
        if let Some(body) = embedded_ruffle_file(file_name) {
            return Ok(response(200, content_type(url_path), body.to_vec()));
        }

        if !file_path.is_file() {
            return Ok(response(404, "text/plain; charset=utf-8", Vec::new()));
        }

        Ok(response(200, content_type(url_path), fs::read(file_path)?))
    }

    fn handle_proxy(
        &self,
        query: Option<&str>,
    ) -> Result<Response, Box<dyn std::error::Error + Send + Sync>> {
        let target_url = url::form_urlencoded::parse(query.unwrap_or_default().as_bytes())
            .find(|(name, _)| name == "url")
            .map(|(_, value)| value.into_owned())
            .ok_or_else(|| format!("missing proxy url"))?;

        let target = url::Url::parse(&target_url)?;
        if !matches!(target.scheme(), "http" | "https") {
            return Err(format!("unsupported proxy url scheme: {}", target.scheme()).into());
        }

        if let Some(host) = target.host_str() {
            if is_local_virtual_host(host) {
                return self.serve_local_target(&target);
            }
        }

        let remote = self.client.get(target_url).send()?;
        let status = remote.status().as_u16();
        let content_type = remote
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let body = remote.bytes()?.to_vec();

        Ok(response(status, &content_type, body))
    }

    fn serve_local_target(
        &self,
        target: &url::Url,
    ) -> Result<Response, Box<dyn std::error::Error + Send + Sync>> {
        if target.host_str() == Some("ruffle.localhost") {
            return self.serve_file(target.path());
        }

        let local_server = self
            .local_server
            .as_ref()
            .ok_or_else(|| format!("local server unavailable for {}", target))?;

        let mut uri = format!("seer2://localhost{}", target.path());
        if let Some(query) = target.query() {
            uri.push('?');
            uri.push_str(query);
        }

        let request = tauri::http::Request::builder()
            .uri(&uri)
            .body(Vec::new())
            .map_err(|err| err.to_string())?;

        let protocol_response = local_server.protocol_response(request);
        let status = protocol_response.status().as_u16();
        let content_type = protocol_response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let body = protocol_response.body().clone();

        Ok(response(status, &content_type, body))
    }
}

fn is_local_virtual_host(host: &str) -> bool {
    matches!(
        host,
        "client.localhost" | "ruffle.localhost" | "seer2.localhost" | "local.client"
    )
}

fn parse_socket_target(url: &str) -> Result<SocketTarget, String> {
    let query = url
        .split_once('?')
        .map(|(_, query)| query.split('#').next().unwrap_or(query))
        .unwrap_or_default();

    let mut host_param = None;
    let mut port_param = None;
    for (name, value) in url::form_urlencoded::parse(query.as_bytes()) {
        match name.as_ref() {
            "host" => host_param = Some(value.into_owned()),
            "port" => port_param = Some(value.into_owned()),
            _ => {}
        }
    }
    if let (Some(host), Some(port)) = (host_param, port_param) {
        let port = port
            .parse::<u16>()
            .map_err(|err| format!("invalid socket proxy port in url {url}: {err}"))?;
        validate_socket_target(&host, port, url)?;
        return Ok(SocketTarget { host, port });
    }

    let rest = url
        .split_once("/ruffle-socket/")
        .map(|(_, rest)| rest)
        .ok_or_else(|| format!("unsupported websocket proxy url: {url}"))?;
    let path = rest
        .split(['?', '#'])
        .next()
        .ok_or_else(|| format!("unsupported websocket proxy url: {url}"))?;
    let mut parts = path.split('/');
    let host = parts
        .next()
        .filter(|host| !host.is_empty())
        .ok_or_else(|| format!("missing socket proxy host in url: {url}"))?
        .to_string();
    let port = parts
        .next()
        .ok_or_else(|| format!("missing socket proxy port in url: {url}"))?
        .parse::<u16>()
        .map_err(|err| format!("invalid socket proxy port in url {url}: {err}"))?;

    validate_socket_target(&host, port, url)?;

    Ok(SocketTarget { host, port })
}

fn validate_socket_target(host: &str, port: u16, url: &str) -> Result<(), String> {
    if host.is_empty() || host.contains('/') || host.contains('\\') || port == 0 {
        return Err(format!("invalid socket proxy target in url: {url}"));
    }

    Ok(())
}

fn connect_socket_target(target: &SocketTarget) -> Result<TcpStream, String> {
    let addrs = (target.host.as_str(), target.port)
        .to_socket_addrs()
        .map_err(|err| format!("failed to resolve {}:{}: {err}", target.host, target.port))?;
    let mut last_error = None;

    for addr in addrs {
        match TcpStream::connect_timeout(&addr, Duration::from_secs(10)) {
            Ok(stream) => return Ok(stream),
            Err(err) => last_error = Some(err),
        }
    }

    Err(format!(
        "failed to connect to {}:{}: {}",
        target.host,
        target.port,
        last_error
            .map(|err| err.to_string())
            .unwrap_or_else(|| "no resolved addresses".to_string())
    ))
}

fn spawn_socket_reader<R: Runtime + 'static>(
    app: AppHandle<R>,
    conn_id: String,
    target: SocketTarget,
    mut reader: TcpStream,
) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 16 * 1024];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    println!(
                        "[ruffle] WS remote closed {} from {}:{}",
                        conn_id, target.host, target.port
                    );
                    break;
                }
                Ok(len) => {
                    if app
                        .emit(&format!("ws_{conn_id}"), buffer[..len].to_vec())
                        .is_err()
                    {
                        break;
                    }
                }
                Err(err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(err) => {
                    println!(
                        "[ruffle] WS read failed {} from {}:{}: {}",
                        conn_id, target.host, target.port, err
                    );
                    break;
                }
            }
        }

        if let Some(state) = app.try_state::<RuffleWsState>() {
            if let Ok(mut connections) = state.connections.lock() {
                connections.remove(&conn_id);
            }
        }
        let _ = app.emit(&format!("ws_close_{conn_id}"), "remote closed");
    });
}

fn resolve_runtime_dir(resource_dir: PathBuf) -> PathBuf {
    let bundled = resource_dir.join("runtime");
    if bundled.is_dir() {
        return bundled;
    }

    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../runtime");
    if dev.is_dir() {
        return dev;
    }

    bundled
}

#[cfg(mobile)]
fn embedded_ruffle_file(path: &str) -> Option<&'static [u8]> {
    match path {
        "FallbackFont.swf" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/FallbackFont.swf"
        ))),
        "ruffle-webview-init.js" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/ruffle-webview-init.js"
        ))),
        "web/16dff1bfa3802a0dd9b1.wasm" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/16dff1bfa3802a0dd9b1.wasm"
        ))),
        "web/core.ruffle.fc7a4dc80da9c2c7ca4b.js" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/core.ruffle.fc7a4dc80da9c2c7ca4b.js"
        ))),
        "web/core.ruffle.fc7a4dc80da9c2c7ca4b.js.map" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/core.ruffle.fc7a4dc80da9c2c7ca4b.js.map"
        ))),
        "web/LICENSE_APACHE" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/LICENSE_APACHE"
        ))),
        "web/LICENSE_MIT" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/LICENSE_MIT"
        ))),
        "web/package.json" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/package.json"
        ))),
        "web/README.md" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/README.md"
        ))),
        "web/ruffle.js" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/ruffle.js"
        ))),
        "web/ruffle.js.map" => Some(include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../runtime/ruffle/web/ruffle.js.map"
        ))),
        _ => None,
    }
}

fn to_protocol_response(response: Response, is_head: bool) -> tauri::http::Response<Vec<u8>> {
    let body_len = response.body.len();
    let body = if is_head { Vec::new() } else { response.body };
    let mut builder = tauri::http::Response::builder()
        .status(response.status)
        .header("access-control-allow-origin", "*")
        .header("content-length", body_len.to_string());

    for (name, value) in response.headers {
        builder = builder.header(name, value);
    }

    builder.body(body).unwrap()
}

fn response(status: u16, content_type: &str, body: Vec<u8>) -> Response {
    Response {
        status,
        headers: vec![("content-type".into(), content_type.into())],
        body,
    }
}

fn content_type(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
    {
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "swf" => "application/x-shockwave-flash",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_socket_target, RuffleServer};
    use crate::ruffle_init::INIT_PATH;
    use reqwest::blocking::Client;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn request(path: &str) -> tauri::http::Request<Vec<u8>> {
        tauri::http::Request::builder()
            .uri(format!("ruffle://localhost{path}"))
            .body(Vec::new())
            .unwrap()
    }

    #[test]
    fn serves_init_script() {
        let root = unique_temp_dir();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("ruffle-webview-init.js"), b"runtime init").unwrap();

        let server = RuffleServer {
            ruffle_dir: root.clone(),
            client: Client::new(),
            local_server: None,
        };
        let response = server.protocol_response(request(INIT_PATH));
        assert_eq!(response.status(), 200);
        assert_eq!(response.body(), b"runtime init");
        assert_eq!(
            response.headers().get("content-type").unwrap(),
            "application/javascript; charset=utf-8"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_http_socket_path() {
        let server = RuffleServer {
            ruffle_dir: PathBuf::new(),
            client: Client::new(),
            local_server: None,
        };
        let response = server.protocol_response(request("/ruffle-socket/"));
        assert_eq!(response.status(), 400);
        assert_eq!(response.body(), b"websocket upgrade required");
    }

    #[test]
    fn runtime_init_script_configures_ruffle_bridge() {
        let script = fs::read_to_string(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../runtime/ruffle/ruffle-webview-init.js"),
        )
        .unwrap();
        assert!(script.contains("__TAURI_FLASH_DETECTION_SHIM_INSTALLED__"));
        assert!(script.contains("__TAURI_RUFFLE_BRIDGE_INSTALLED__"));
        assert!(script.contains("http://ruffle.localhost/ruffle/web/ruffle.js"));
        assert!(script.contains("publicPath: \"http://ruffle.localhost/ruffle/web/\""));
        assert!(
            script.contains("fontSources: [\"http://ruffle.localhost/ruffle/FallbackFont.swf\"]")
        );
        assert!(script.contains("proxyUrl: \"ws://ruffle.localhost/ruffle-socket/\""));
        assert!(script.contains("proxyUrl: \"http://ruffle.localhost/ruffle-proxy/\""));
        assert!(script.contains("ruffle_register_ws"));
        assert!(script.contains("ruffle_ws_send"));
        assert!(script.contains("ruffle_ws_close"));
        assert!(script.contains("ruffle.localhost"));
        assert!(!script.contains("http://client.localhost/ruffle"));
        assert!(!script.contains("plugin:ruffle-interceptor"));
        assert!(script.contains("setTimeout(injectRuffle, 0)"));
        assert!(!script.contains("DOMContentLoaded"));
        assert!(script.contains("document.head.appendChild(script)"));
        assert!(!script.contains("document.documentElement"));
        assert!(script.contains("favorFlash: false"));
        assert!(script.contains("polyfills: true"));
        assert!(!script.contains("<script>"));
        assert!(!script.contains("</script>"));
    }

    #[test]
    fn serves_runtime_wasm_with_wasm_content_type() {
        let root = unique_temp_dir();
        let web_dir = root.join("web");
        fs::create_dir_all(&web_dir).unwrap();
        fs::write(web_dir.join("player.wasm"), b"wasm").unwrap();

        let server = RuffleServer {
            ruffle_dir: root.clone(),
            client: Client::new(),
            local_server: None,
        };
        let response = server.protocol_response(request("/ruffle/web/player.wasm"));

        assert_eq!(response.status(), 200);
        assert_eq!(response.body(), b"wasm");
        assert_eq!(
            response.headers().get("content-type").unwrap(),
            "application/wasm"
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn parses_socket_proxy_url() {
        let target =
            parse_socket_target("ws://local.client/ruffle-socket/118.89.150.23/1863").unwrap();

        assert_eq!(target.host, "118.89.150.23");
        assert_eq!(target.port, 1863);
    }

    #[test]
    fn parses_socket_proxy_url_with_query() {
        let target =
            parse_socket_target("ws://local.client/ruffle-socket/ctsr2login.61.com/1863?v=1")
                .unwrap();

        assert_eq!(target.host, "ctsr2login.61.com");
        assert_eq!(target.port, 1863);
    }

    #[test]
    fn parses_socket_proxy_url_query_target() {
        let target = parse_socket_target(
            "ws://ruffle.localhost/ruffle-socket/?host=ctsr2login.61.com&port=1863",
        )
        .unwrap();

        assert_eq!(target.host, "ctsr2login.61.com");
        assert_eq!(target.port, 1863);
    }

    fn unique_temp_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("seer2-ruffle-test-{}-{nanos}", std::process::id()))
    }
}
