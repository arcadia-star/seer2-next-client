#[cfg(mobile)]
mod android;
#[cfg(desktop)]
mod menu;
mod ruffle;
mod ruffle_init;
mod server;

use std::sync::{Arc, Mutex};
#[cfg(mobile)]
use tauri::Emitter;
use tauri::Manager;

#[cfg(desktop)]
const CONTENT_WIDTH: f64 = 1200.0;
#[cfg(desktop)]
const CONTENT_HEIGHT: f64 = 660.0;
#[cfg(desktop)]
const MIN_CONTENT_WIDTH: f64 = 960.0;
#[cfg(desktop)]
const MIN_CONTENT_HEIGHT: f64 = 540.0;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    {
        run_desktop();
    }
    #[cfg(not(desktop))]
    {
        run_mobile();
    }
}

#[cfg(desktop)]
fn run_desktop() {
    let local_server: Arc<Mutex<Option<server::LocalServer>>> = Arc::new(Mutex::new(None));
    let ruffle_server: Arc<Mutex<Option<ruffle::RuffleServer>>> = Arc::new(Mutex::new(None));
    let ruffle_protocol_server = Arc::clone(&ruffle_server);
    let seer2_protocol_server = Arc::clone(&local_server);
    let menu_state = menu::MenuState::default();
    let menu_event_state = menu_state.clone();

    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("seer2-webview-init")
                .js_init_script_on_all_frames(ruffle_init::bootstrap_script())
                .build(),
        )
        .manage(ruffle::RuffleWsState::default())
        .invoke_handler(tauri::generate_handler![
            ruffle::ruffle_register_ws,
            ruffle::ruffle_ws_send,
            ruffle::ruffle_ws_close
        ])
        .register_asynchronous_uri_scheme_protocol("ruffle", move |_ctx, request, responder| {
            respond_ruffle_protocol(Arc::clone(&ruffle_protocol_server), request, responder);
        })
        .register_asynchronous_uri_scheme_protocol("seer2", move |_ctx, request, responder| {
            respond_local_protocol(Arc::clone(&seer2_protocol_server), request, responder);
        })
        .on_menu_event(move |app, event| {
            menu::handle_event(app, &menu_event_state, event.id().as_ref());
        })
        .setup(move |app| {
            let app_data_dir = app.path().app_data_dir()?;
            let resource_dir = app.path().resource_dir()?;
            if let Ok(mut current) = ruffle_server.lock() {
                *current = Some(ruffle::create(resource_dir.clone(), None));
            }
            let server = server::create(app_data_dir).map_err(|err| {
                Box::<dyn std::error::Error>::from(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    err.to_string(),
                ))
            })?;
            let ruffle = ruffle::create(resource_dir, Some(server.clone()));

            if let Ok(mut current) = local_server.lock() {
                *current = Some(server);
            }
            if let Ok(mut current) = ruffle_server.lock() {
                *current = Some(ruffle);
            }

            menu::install(app, menu_state.clone())?;

            if let Some(window) = app.get_webview_window("main") {
                window.set_min_size(Some(tauri::LogicalSize::new(
                    MIN_CONTENT_WIDTH,
                    MIN_CONTENT_HEIGHT,
                )))?;
                window.set_size(tauri::LogicalSize::new(CONTENT_WIDTH, CONTENT_HEIGHT))?;
                window.navigate(server::http_entry_url().parse()?)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(desktop))]
fn run_mobile() {
    let local_server: Arc<Mutex<Option<server::LocalServer>>> = Arc::new(Mutex::new(None));
    let ruffle_server: Arc<Mutex<Option<ruffle::RuffleServer>>> = Arc::new(Mutex::new(None));
    let ruffle_protocol_server = Arc::clone(&ruffle_server);
    let seer2_protocol_server = Arc::clone(&local_server);

    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("seer2-webview-init")
                .js_init_script_on_all_frames(ruffle_init::bootstrap_script())
                .build(),
        )
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("seer2-android-guard")
                .js_init_script_on_all_frames(android::init_script())
                .on_navigation(|_, url| android::is_allowed_navigation(url))
                .build(),
        )
        .manage(ruffle::RuffleWsState::default())
        .invoke_handler(tauri::generate_handler![
            ruffle::ruffle_register_ws,
            ruffle::ruffle_ws_send,
            ruffle::ruffle_ws_close,
            android_exit_game
        ])
        .register_asynchronous_uri_scheme_protocol("ruffle", move |_ctx, request, responder| {
            respond_ruffle_protocol(Arc::clone(&ruffle_protocol_server), request, responder);
        })
        .register_asynchronous_uri_scheme_protocol("seer2", move |_ctx, request, responder| {
            respond_local_protocol(Arc::clone(&seer2_protocol_server), request, responder);
        })
        .setup(move |app| {
            let app_data_dir = app.path().app_data_dir()?;
            let resource_dir = app.path().resource_dir()?;
            if let Ok(mut current) = ruffle_server.lock() {
                *current = Some(ruffle::create(resource_dir.clone(), None));
            }
            let app_handle = app.handle().clone();
            let load_failure_notifier = Arc::new(move |message: String| {
                let _ = app_handle.emit("android_game_load_failed", message.clone());
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.eval(&android::load_failed_script(&message));
                }
            });
            let server =
                match server::create_with_load_failure_handler(app_data_dir, load_failure_notifier)
                {
                    Ok(server) => server,
                    Err(err) => {
                        if let Some(window) = app.get_webview_window("main") {
                            let message = format!("{ANDROID_LOAD_FAILED_MESSAGE}\n{err}");
                            let _ = window.eval(&android::load_failed_script(&message));
                        }
                        return Ok(());
                    }
                };
            let ruffle = ruffle::create(resource_dir, Some(server.clone()));

            if let Ok(mut current) = local_server.lock() {
                *current = Some(server);
            }
            if let Ok(mut current) = ruffle_server.lock() {
                *current = Some(ruffle);
            }

            if let Some(window) = app.get_webview_window("main") {
                window.navigate(server::http_entry_url().parse()?)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(mobile)]
const ANDROID_LOAD_FAILED_MESSAGE: &str =
    "\u{6e38}\u{620f}\u{52a0}\u{8f7d}\u{5931}\u{8d25}\u{ff0c}\u{8bf7}\u{68c0}\u{67e5}\u{7f51}\u{7edc}\u{540e}\u{91cd}\u{8bd5}\u{3002}";

#[tauri::command]
#[cfg(mobile)]
fn android_exit_game<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

fn respond_local_protocol(
    local_server: Arc<Mutex<Option<server::LocalServer>>>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    std::thread::spawn(move || {
        let server = wait_for_server(&local_server);
        let response = match server {
            Some(server) => server.protocol_response(request),
            None => server::unavailable_protocol_response(),
        };
        responder.respond(response);
    });
}

fn respond_ruffle_protocol(
    ruffle_server: Arc<Mutex<Option<ruffle::RuffleServer>>>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    std::thread::spawn(move || {
        let server = wait_for_server(&ruffle_server);
        let response = match server {
            Some(server) => server.protocol_response(request),
            None => ruffle::unavailable_protocol_response(),
        };
        responder.respond(response);
    });
}

fn wait_for_server<T: Clone>(server: &Arc<Mutex<Option<T>>>) -> Option<T> {
    for _ in 0..200 {
        if let Some(server) = server.lock().ok().and_then(|server| server.clone()) {
            return Some(server);
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    None
}
