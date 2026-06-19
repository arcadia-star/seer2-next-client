use serde::Deserialize;
use std::collections::HashMap;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Manager, Runtime};

const LOCAL_HTTP_ORIGIN: &str = "http://seer2.localhost";
const LEGACY_LOCAL_ORIGIN: &str = "http://127.0.0.1:7337";

#[derive(Clone, Debug)]
pub enum MenuAction {
    Navigate(String),
    External(String),
    Role(String),
}

#[derive(Clone, Default)]
pub struct MenuState {
    actions: Arc<Mutex<HashMap<String, MenuAction>>>,
    zoom: Arc<Mutex<f64>>,
}

#[derive(Deserialize)]
struct MenuConfig {
    menus: Vec<DynMenu>,
}

#[derive(Deserialize)]
struct DynMenu {
    label: String,
    url: Option<String>,
    #[serde(rename = "externalUrl")]
    external_url: Option<String>,
    role: Option<String>,
    submenu: Option<Vec<DynMenu>>,
}

pub fn install(app: &App, state: MenuState) -> tauri::Result<()> {
    let config: MenuConfig = serde_json::from_str(include_str!("../../src/menu.json"))
        .map_err(|err| tauri::Error::Anyhow(err.into()))?;

    let mut ids = IdFactory::default();
    let mut root = MenuBuilder::new(app);
    let mut actions = HashMap::new();

    for menu in &config.menus {
        let submenu = build_submenu(app, menu, &mut ids, &mut actions)?;
        root = root.item(&submenu);
    }

    if let Ok(mut current) = state.actions.lock() {
        *current = actions;
    }

    app.set_menu(root.build()?)?;
    Ok(())
}

pub fn handle_event<R: Runtime>(app: &AppHandle<R>, state: &MenuState, id: &str) {
    let action = state
        .actions
        .lock()
        .ok()
        .and_then(|actions| actions.get(id).cloned());

    let Some(action) = action else {
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    match action {
        MenuAction::Navigate(url) => {
            if let Ok(url) = normalize_navigation_url(&url).parse() {
                let _ = window.navigate(url);
            }
        }
        MenuAction::External(url) => {
            let _ = open_external(&url);
        }
        MenuAction::Role(role) => match role.as_str() {
            "reload" => {
                let _ = window.eval("window.location.reload()");
            }
            "close" => {
                let _ = window.close();
            }
            "togglefullscreen" => {
                if let Ok(fullscreen) = window.is_fullscreen() {
                    let _ = window.set_fullscreen(!fullscreen);
                }
            }
            "toggleDevTools" => {
                window.open_devtools();
            }
            "resetZoom" => set_zoom(&window, &state.zoom, 1.0),
            "zoomIn" => adjust_zoom(&window, &state.zoom, 0.2),
            "zoomOut" => adjust_zoom(&window, &state.zoom, -0.2),
            "about" => {
                let _ = window.eval("alert('seer2-next-client-tauri v1.1.4')");
            }
            _ => {}
        },
    }
}

fn build_submenu<M: Manager<tauri::Wry>>(
    manager: &M,
    menu: &DynMenu,
    ids: &mut IdFactory,
    actions: &mut HashMap<String, MenuAction>,
) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let mut builder = SubmenuBuilder::new(manager, &menu.label);

    if let Some(children) = &menu.submenu {
        for child in children {
            if child
                .submenu
                .as_ref()
                .is_some_and(|submenu| !submenu.is_empty())
            {
                let submenu = build_submenu(manager, child, ids, actions)?;
                builder = builder.item(&submenu);
            } else {
                let id = ids.next();
                let item = MenuItemBuilder::with_id(id.clone(), &child.label).build(manager)?;
                if let Some(action) = action_from_menu(child) {
                    actions.insert(id, action);
                }
                builder = builder.item(&item);
            }
        }
    }

    builder.build()
}

fn action_from_menu(menu: &DynMenu) -> Option<MenuAction> {
    if let Some(url) = &menu.url {
        return Some(MenuAction::Navigate(url.clone()));
    }
    if let Some(url) = &menu.external_url {
        return Some(MenuAction::External(url.clone()));
    }
    if let Some(role) = &menu.role {
        return Some(MenuAction::Role(role.clone()));
    }
    None
}

fn normalize_navigation_url(url: &str) -> String {
    if let Some(path) = url.strip_prefix(LEGACY_LOCAL_ORIGIN) {
        return format!("{LOCAL_HTTP_ORIGIN}{path}");
    }
    url.to_string()
}

fn adjust_zoom<R: Runtime>(window: &tauri::WebviewWindow<R>, zoom: &Arc<Mutex<f64>>, delta: f64) {
    let next = zoom
        .lock()
        .map(|mut value| {
            *value = (*value + delta).clamp(0.2, 5.0);
            *value
        })
        .unwrap_or(1.0);
    let _ = window.set_zoom(next);
}

fn set_zoom<R: Runtime>(window: &tauri::WebviewWindow<R>, zoom: &Arc<Mutex<f64>>, value: f64) {
    if let Ok(mut current) = zoom.lock() {
        *current = value;
    }
    let _ = window.set_zoom(value);
}

fn open_external(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", "", url]).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn()?;
    }
    Ok(())
}

#[derive(Default)]
struct IdFactory {
    next: usize,
}

impl IdFactory {
    fn next(&mut self) -> String {
        let id = format!("dyn-menu-{}", self.next);
        self.next += 1;
        id
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_navigation_url, MenuConfig};

    #[test]
    fn parses_shared_menu_config() {
        let config: MenuConfig = serde_json::from_str(include_str!("../../src/menu.json")).unwrap();
        assert!(!config.menus.is_empty());
    }

    #[test]
    fn keeps_seer_remote_navigation_direct() {
        assert_eq!(
            normalize_navigation_url("https://seer.61.com/play.shtml"),
            "https://seer.61.com/play.shtml"
        );
    }

    #[test]
    fn migrates_legacy_local_navigation_to_client_domain() {
        assert_eq!(
            normalize_navigation_url("http://127.0.0.1:7337/seer2/play-local-test.html"),
            "http://seer2.localhost/seer2/play-local-test.html"
        );
    }
}
