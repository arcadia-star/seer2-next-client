use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT_ENCODING, LAST_MODIFIED};
use std::collections::HashSet;
use std::fs::{self, FileTimes};
use std::net::{IpAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DNS_ROOT: &str = "next-client-root.733702.xyz";
const FALLBACK_ROOT_HOST: &str = "81.70.189.57";
const SEER2_PATH: &str = "/seer2";
const SEER2_MEE_URL: &str = "http://seer2.61.com";
const LOCAL_HTTP_ORIGIN: &str = "http://seer2.localhost";
const FLASH_POLICY_PATH: &str = "/crossdomain.xml";
const FLASH_POLICY_DATA: &str = "<?xml version=\"1.0\"?><!DOCTYPE cross-domain-policy SYSTEM \"http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd\"><cross-domain-policy><allow-access-from domain=\"*\" /></cross-domain-policy>";
const MAGIC_PATH: &str = "/seer2-next-client-hello";
const FAVICON_PATH: &str = "/favicon.ico";
const BLOOM_PATH: &str = "/config/bloom-path.data";
const LOCAL_ENTRY_PATH: &str = "/seer2/play-local.html";
const CLIENT_SWF_PATH: &str = "/seer2/Client.swf";
const LOAD_FAILED_PREFIX: &str =
    "\u{6e38}\u{620f}\u{52a0}\u{8f7d}\u{5931}\u{8d25}\u{ff0c}\u{8bf7}\u{68c0}\u{67e5}\u{7f51}\u{7edc}\u{540e}\u{91cd}\u{8bd5}\u{3002}";

type LoadFailureNotifier = Arc<dyn Fn(String) + Send + Sync>;

#[derive(Clone)]
struct Bloom {
    func_num: usize,
    bits: Vec<bool>,
}

struct ServerState {
    root_url: String,
    bloom: Bloom,
    cache_dir: PathBuf,
    proxy_file_root: Mutex<Option<PathBuf>>,
    file_locks: Mutex<HashSet<String>>,
    client: Client,
    load_failure_notifier: Option<LoadFailureNotifier>,
    load_failure_reported: Mutex<bool>,
}

#[derive(Clone)]
pub struct LocalServer {
    state: Arc<ServerState>,
}

struct Request {
    path: String,
    query: Option<String>,
}

struct Response {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

fn entry_url(origin: &str) -> String {
    format!(
        "{origin}{LOCAL_ENTRY_PATH}?version={}&platform={}&arch={}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    )
}

pub fn http_entry_url() -> String {
    entry_url(LOCAL_HTTP_ORIGIN)
}

#[cfg(desktop)]
pub fn create(
    app_data_dir: PathBuf,
) -> Result<LocalServer, Box<dyn std::error::Error + Send + Sync>> {
    create_inner(app_data_dir, None)
}

#[cfg(mobile)]
pub fn create_with_load_failure_handler(
    app_data_dir: PathBuf,
    load_failure_notifier: LoadFailureNotifier,
) -> Result<LocalServer, Box<dyn std::error::Error + Send + Sync>> {
    create_inner(app_data_dir, Some(load_failure_notifier))
}

fn create_inner(
    app_data_dir: PathBuf,
    load_failure_notifier: Option<LoadFailureNotifier>,
) -> Result<LocalServer, Box<dyn std::error::Error + Send + Sync>> {
    let root_url = resolve_root_url()?;
    let client = Client::builder().timeout(Duration::from_secs(30)).build()?;
    let bloom_text = load_bloom_text(&client, &root_url)?;
    let bloom =
        Bloom::parse(&bloom_text).map_err(|err| format!("version file parse failed: {err}"))?;

    let version_path = format!("/version/seer2-next-client/v{}", env!("CARGO_PKG_VERSION"));
    if !bloom.contains(&version_path) {
        return Err("current client version has been disabled".into());
    }

    Ok(LocalServer {
        state: Arc::new(ServerState {
            root_url,
            bloom,
            cache_dir: app_data_dir.join("Game Cache V2 Tauri"),
            proxy_file_root: Mutex::new(None),
            file_locks: Mutex::new(HashSet::new()),
            client,
            load_failure_notifier,
            load_failure_reported: Mutex::new(false),
        }),
    })
}

fn load_bloom_text(
    client: &Client,
    root_url: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let url = format!("{root_url}{BLOOM_PATH}");
    let mut last_error = None;

    for attempt in 1..=3 {
        match client
            .get(&url)
            .header(ACCEPT_ENCODING, "identity")
            .send()
            .and_then(|response| response.error_for_status())
            .and_then(|response| response.bytes())
        {
            Ok(bytes) => return Ok(String::from_utf8_lossy(&bytes).into_owned()),
            Err(err) => {
                eprintln!("version file load failed attempt {attempt}: {err}");
                last_error = Some(err.to_string());
                thread::sleep(Duration::from_millis(500));
            }
        }
    }

    Err(format!(
        "version file load failed: {}",
        last_error.unwrap_or_else(|| "unknown error".into())
    )
    .into())
}

pub fn unavailable_protocol_response() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(503)
        .header("content-type", "text/plain; charset=utf-8")
        .body(b"local server is not ready".to_vec())
        .unwrap()
}

impl LocalServer {
    pub fn protocol_response(
        &self,
        request: tauri::http::Request<Vec<u8>>,
    ) -> tauri::http::Response<Vec<u8>> {
        let is_head = request.method() == tauri::http::Method::HEAD;
        let request = Request {
            path: request.uri().path().to_string(),
            query: request.uri().query().map(ToOwned::to_owned),
        };
        let response = match handle_request(Arc::clone(&self.state), request) {
            Ok(response) => response,
            Err(err) => response(
                500,
                "text/plain; charset=utf-8",
                format!("server error: {err}").into_bytes(),
            ),
        };
        to_protocol_response(response, is_head)
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

impl Bloom {
    fn parse(data: &str) -> Result<Self, String> {
        let split: Vec<&str> = data.lines().collect();
        let func_num = split
            .get(1)
            .ok_or("missing bloom function count")?
            .trim()
            .parse::<usize>()
            .map_err(|err| err.to_string())?;
        let bytes = STANDARD
            .decode(split.get(2).ok_or("missing bloom bitset")?.trim())
            .map_err(|err| err.to_string())?;
        let mut bits = Vec::with_capacity(bytes.len() * 8);
        for byte in bytes {
            for index in 0..8 {
                bits.push(((byte >> index) & 1) == 1);
            }
        }
        if bits.is_empty() {
            return Err("empty bloom bitset".into());
        }
        Ok(Self { func_num, bits })
    }

    fn contains(&self, data: &str) -> bool {
        let hash = md5_hex(data);
        let hash1 = parse_hash_part(&hash[0..8]) ^ parse_hash_part(&hash[8..16]);
        let hash2 = parse_hash_part(&hash[16..24]) ^ parse_hash_part(&hash[24..32]);
        let mut combined_hash = hash1 as u64;

        for _ in 0..self.func_num {
            combined_hash &= 0xffff_ffff;
            if !self.bits[(combined_hash % self.bits.len() as u64) as usize] {
                return false;
            }
            combined_hash = combined_hash.wrapping_add(hash2 as u64);
        }
        true
    }
}

fn parse_hash_part(part: &str) -> u32 {
    u32::from_str_radix(part, 16).unwrap_or(0)
}

fn resolve_root_url() -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let address = match (DNS_ROOT, 80).to_socket_addrs() {
        Ok(mut addrs) => addrs.next().map(|addr| addr.ip()),
        Err(err) => {
            eprintln!("dns lookup failed: {DNS_ROOT}: {err}; using fallback {FALLBACK_ROOT_HOST}");
            None
        }
    };
    let host = match address {
        Some(IpAddr::V4(ip)) => ip.to_string(),
        Some(IpAddr::V6(ip)) => format!("[{ip}]"),
        None => FALLBACK_ROOT_HOST.to_string(),
    };
    println!("dns lookup: {DNS_ROOT} {host}");
    Ok(format!("http://{host}{SEER2_PATH}"))
}

fn handle_request(
    state: Arc<ServerState>,
    request: Request,
) -> Result<Response, Box<dyn std::error::Error + Send + Sync>> {
    let url_path = request.path.clone();
    if url_path == MAGIC_PATH {
        return Ok(response(
            200,
            "application/json; charset=utf-8",
            format!("{{\"version\":\"{}\"}}", env!("CARGO_PKG_VERSION")).into_bytes(),
        ));
    }
    if url_path == FAVICON_PATH {
        return Ok(response(204, "image/x-icon", Vec::new()));
    }
    if url_path == FLASH_POLICY_PATH {
        return Ok(response(
            200,
            "application/xml; charset=utf-8",
            FLASH_POLICY_DATA.as_bytes().to_vec(),
        ));
    }
    if url_path.ends_with('/') || url_path.ends_with('\\') || !url_path.starts_with(SEER2_PATH) {
        return Ok(response(
            403,
            "text/plain; charset=utf-8",
            b"not a valid path".to_vec(),
        ));
    }
    if url_path == LOCAL_ENTRY_PATH && !query_has_key(request.query.as_deref(), "version") {
        return Ok(redirect(entry_url(LOCAL_HTTP_ORIGIN)));
    }

    if let Some(proxy_response) = try_proxy_file(&state, &url_path)? {
        return Ok(proxy_response);
    }

    let bloom_path = &url_path[SEER2_PATH.len()..];
    if bloom_path == BLOOM_PATH {
        return Ok(response(403, "text/plain; charset=utf-8", Vec::new()));
    }

    let path_hit_bloom = state.bloom.contains(bloom_path);
    let cache_path =
        state
            .cache_dir
            .join(format!("{}_{}", md5_hex(&url_path[1..]), url_path.len()));

    if !is_file_locked(&state, bloom_path) {
        if let Ok(stats) = fs::metadata(&cache_path) {
            if stats.is_file() {
                let modified = stats.modified().unwrap_or(UNIX_EPOCH);
                if path_hit_bloom {
                    let bloom_version_path = format!("{bloom_path}?v={}", mtime_ms(modified));
                    if state.bloom.contains(&bloom_version_path) {
                        if let Ok(body) = read_cache(&cache_path) {
                            return Ok(cache_response(&url_path, body, modified));
                        }
                    }
                } else if let Ok(body) = read_cache(&cache_path) {
                    return Ok(cache_response(&url_path, body, modified));
                }
            }
        }
    }

    fetch_and_cache(
        state,
        &url_path,
        bloom_path,
        request.query.as_deref(),
        path_hit_bloom,
        cache_path,
    )
}

fn try_proxy_file(
    state: &ServerState,
    url_path: &str,
) -> Result<Option<Response>, Box<dyn std::error::Error + Send + Sync>> {
    let proxy_root = state
        .proxy_file_root
        .lock()
        .ok()
        .and_then(|root| root.clone());
    let Some(proxy_root) = proxy_root else {
        return Ok(None);
    };

    let file_path = proxy_root.join(url_path.trim_start_matches('/'));
    if file_path.is_file() {
        let body = fs::read(file_path)?;
        return Ok(Some(response(200, content_type(url_path), body)));
    }
    Ok(None)
}

fn fetch_and_cache(
    state: Arc<ServerState>,
    url_path: &str,
    bloom_path: &str,
    query: Option<&str>,
    path_hit_bloom: bool,
    cache_path: PathBuf,
) -> Result<Response, Box<dyn std::error::Error + Send + Sync>> {
    let base = if path_hit_bloom {
        state.root_url.as_str()
    } else {
        SEER2_MEE_URL
    };
    let file_url = match query {
        Some(query) => format!("{base}{bloom_path}?{query}"),
        None => format!("{base}{bloom_path}"),
    };
    println!("fetch: {file_url}");

    let remote = match state.client.get(file_url).send() {
        Ok(remote) => remote,
        Err(err) => {
            if is_critical_game_path(url_path) {
                notify_game_load_failure(&state, format!("{LOAD_FAILED_PREFIX}\n{err}"));
            }
            return Err(err.into());
        }
    };
    let status = remote.status().as_u16();
    if status >= 400 && is_critical_game_path(url_path) {
        notify_game_load_failure(
            &state,
            format!("{LOAD_FAILED_PREFIX}\nHTTP {status}: {url_path}"),
        );
    }
    let modified = remote
        .headers()
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_http_date);
    let body = match remote.bytes() {
        Ok(bytes) => bytes.to_vec(),
        Err(err) => {
            if is_critical_game_path(url_path) {
                notify_game_load_failure(&state, format!("{LOAD_FAILED_PREFIX}\n{err}"));
            }
            return Err(err.into());
        }
    };

    if status == 200 {
        let state_for_write = Arc::clone(&state);
        let bloom_path = bloom_path.to_string();
        let body_for_write = body.clone();
        thread::spawn(move || {
            if let Err(err) = write_cache(
                &state_for_write,
                &bloom_path,
                &cache_path,
                &body_for_write,
                modified,
            ) {
                eprintln!("cache write error: {err}");
            }
        });
    }

    let mut res = response(status, content_type(url_path), body);
    res.headers.push(("x-hit".into(), "fetch".into()));
    Ok(res)
}

fn notify_game_load_failure(state: &ServerState, message: String) {
    let Some(notifier) = &state.load_failure_notifier else {
        return;
    };
    let should_notify = state
        .load_failure_reported
        .lock()
        .map(|mut reported| {
            if *reported {
                false
            } else {
                *reported = true;
                true
            }
        })
        .unwrap_or(false);
    if should_notify {
        notifier(message);
    }
}

fn is_critical_game_path(url_path: &str) -> bool {
    url_path == LOCAL_ENTRY_PATH || url_path.eq_ignore_ascii_case(CLIENT_SWF_PATH)
}

fn write_cache(
    state: &ServerState,
    url_path: &str,
    file_path: &Path,
    body: &[u8],
    modified: Option<SystemTime>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let lock_key = url_path.to_string();
    {
        let mut locks = state.file_locks.lock().map_err(|_| "file lock poisoned")?;
        if !locks.insert(lock_key.clone()) {
            return Ok(());
        }
    }

    let result = (|| {
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(file_path, body)?;
        if let Some(modified) = modified {
            fs::File::options()
                .write(true)
                .open(file_path)?
                .set_times(FileTimes::new().set_modified(modified))?;
        }
        Ok(())
    })();

    if let Ok(mut locks) = state.file_locks.lock() {
        locks.remove(&lock_key);
    }
    result
}

fn read_cache(file_path: &Path) -> Result<Vec<u8>, Box<dyn std::error::Error + Send + Sync>> {
    Ok(fs::read(file_path)?)
}

fn cache_response(url_path: &str, body: Vec<u8>, modified: SystemTime) -> Response {
    let mut res = response(200, content_type(url_path), body);
    res.headers.push(("x-hit".into(), "file".into()));
    res.headers
        .push(("x-cache-mtime-ms".into(), mtime_ms(modified).to_string()));
    res
}

fn response(status: u16, content_type: &str, body: Vec<u8>) -> Response {
    Response {
        status,
        headers: vec![("content-type".into(), content_type.into())],
        body,
    }
}

fn redirect(location: String) -> Response {
    Response {
        status: 302,
        headers: vec![("location".into(), location)],
        body: Vec::new(),
    }
}

fn query_has_key(query: Option<&str>, key: &str) -> bool {
    query
        .unwrap_or_default()
        .split('&')
        .filter_map(|pair| pair.split_once('=').map(|(name, _)| name).or(Some(pair)))
        .any(|name| name == key)
}

#[cfg(test)]
fn query_param(query: Option<&str>, key: &str) -> Option<String> {
    url::form_urlencoded::parse(query.unwrap_or_default().as_bytes())
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.into_owned())
}

fn is_file_locked(state: &ServerState, bloom_path: &str) -> bool {
    state
        .file_locks
        .lock()
        .map(|locks| locks.contains(bloom_path))
        .unwrap_or(false)
}

fn md5_hex(data: &str) -> String {
    format!("{:x}", md5::compute(data))
}

fn mtime_ms(time: SystemTime) -> u128 {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn parse_http_date(value: &str) -> Option<SystemTime> {
    let (_, rest) = value.trim().split_once(',')?;
    let mut parts = rest.split_whitespace();
    let day = parts.next()?.parse::<u32>().ok()?;
    let month = parse_http_month(parts.next()?)?;
    let year = parts.next()?.parse::<i32>().ok()?;
    let time = parts.next()?;
    if parts.next()? != "GMT" || parts.next().is_some() {
        return None;
    }

    let mut time_parts = time.split(':');
    let hour = time_parts.next()?.parse::<u32>().ok()?;
    let minute = time_parts.next()?.parse::<u32>().ok()?;
    let second = time_parts.next()?.parse::<u32>().ok()?;
    if time_parts.next().is_some()
        || day == 0
        || day > days_in_month(year, month)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }

    let timestamp = unix_timestamp(year, month, day, hour, minute, second)?;
    UNIX_EPOCH.checked_add(Duration::from_secs(timestamp as u64))
}

fn parse_http_month(value: &str) -> Option<u32> {
    match value {
        "Jan" => Some(1),
        "Feb" => Some(2),
        "Mar" => Some(3),
        "Apr" => Some(4),
        "May" => Some(5),
        "Jun" => Some(6),
        "Jul" => Some(7),
        "Aug" => Some(8),
        "Sep" => Some(9),
        "Oct" => Some(10),
        "Nov" => Some(11),
        "Dec" => Some(12),
        _ => None,
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn unix_timestamp(
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> Option<i64> {
    let year = year - i32::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month = month as i32;
    let day_of_year = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day as i32 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146097 + day_of_era - 719468;
    let seconds = i64::from(days) * 86_400
        + i64::from(hour) * 3_600
        + i64::from(minute) * 60
        + i64::from(second);
    (seconds >= 0).then_some(seconds)
}

fn content_type(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
    {
        "html" | "htm" | "shtml" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "swf" => "application/x-shockwave-flash",
        "wasm" => "application/wasm",
        "map" => "application/json; charset=utf-8",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::content_type;

    #[test]
    fn decodes_proxy_url_query_param() {
        let url = super::query_param(
            Some("url=http%3A%2F%2Fnewmisc.taomee.com%2Fmisc.js%3Fgameid%3D10"),
            "url",
        )
        .unwrap();
        assert_eq!(url, "http://newmisc.taomee.com/misc.js?gameid=10");
    }

    #[test]
    fn parses_last_modified_http_date() {
        let modified = super::parse_http_date("Wed, 21 Oct 2015 07:28:00 GMT").unwrap();
        assert_eq!(super::mtime_ms(modified), 1_445_412_480_000);
    }

    #[test]
    fn serves_wasm_with_wasm_content_type() {
        assert_eq!(content_type("/seer2/player.wasm"), "application/wasm");
        assert_eq!(content_type("/play.shtml"), "text/html; charset=utf-8");
    }
}
