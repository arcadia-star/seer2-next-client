use tauri::Url;

const INIT_SCRIPT: &str = r#"(() => {
    const protocol = window.location.protocol;
    if (!["http:", "https:"].includes(protocol)) return;

    const configureRuffle = () => {
        window.RufflePlayer = window.RufflePlayer || {};
        const config = window.RufflePlayer.config || {};
        window.RufflePlayer.config = {
            ...config,
            autoplay: "on",
            allowFullscreen: true,
            openUrlMode: "deny",
            showSwfDownload: false,
            splashScreen: false,
            unmuteOverlay: "hidden",
            warnOnUnsupportedContent: false
        };
    };
    configureRuffle();
    setTimeout(configureRuffle, 0);

    if (!window.__SEER2_ANDROID_NAV_GUARD_INSTALLED__) {
        window.__SEER2_ANDROID_NAV_GUARD_INSTALLED__ = true;

        const block = (event) => {
            event?.preventDefault?.();
            event?.stopImmediatePropagation?.();
            return false;
        };

        window.open = () => null;

        document.addEventListener("click", (event) => {
            const link = event.target?.closest?.("a[href], area[href]");
            if (!link) return;
            block(event);
        }, true);

        document.addEventListener("submit", block, true);
    }

    if (window.top !== window) return;
    if (window.__SEER2_ANDROID_UI_INSTALLED__) return;
    window.__SEER2_ANDROID_UI_INSTALLED__ = true;

    const invokeExit = () => {
        if (window.AndroidSeer2?.exitGame) {
            window.AndroidSeer2.exitGame();
            return;
        }
        window.__TAURI__?.core?.invoke?.("android_exit_game");
    };

    const showLoadFailure = (message) => {
        const text = message || "\u6e38\u620f\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002";
        if (window.__SEER2_ANDROID_LOAD_FAILURE_SHOWN__) return;
        window.__SEER2_ANDROID_LOAD_FAILURE_SHOWN__ = true;

        if (window.AndroidSeer2?.showLoadFailureAndExit) {
            window.AndroidSeer2.showLoadFailureAndExit(text);
            return;
        }

        alert(text);
        invokeExit();
    };

    const installExitButton = () => {
        if (!document.body || document.getElementById("seer2-android-exit")) {
            return;
        }

        const button = document.createElement("button");
        button.id = "seer2-android-exit";
        button.type = "button";
        button.setAttribute("aria-label", "\u9000\u51fa\u6e38\u620f");
        button.textContent = "\u00d7";
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (confirm("\u786e\u5b9a\u8981\u9000\u51fa\u6e38\u620f\u5417\uff1f")) {
                invokeExit();
            }
        });
        document.body.appendChild(button);

        const style = document.createElement("style");
        style.textContent = `
            #seer2-android-exit {
                position: fixed;
                z-index: 2147483647;
                top: 10px;
                left: 10px;
                width: 42px;
                height: 42px;
                border: 1px solid rgba(255, 255, 255, 0.55);
                border-radius: 999px;
                background: rgba(0, 0, 0, 0.55);
                color: #fff;
                font: 400 32px/38px system-ui, sans-serif;
                text-align: center;
                padding: 0;
                -webkit-tap-highlight-color: transparent;
            }
            #seer2-android-exit:active {
                background: rgba(255, 255, 255, 0.2);
            }
        `;
        document.head?.appendChild(style);
    };

    const installViewportFix = () => {
        if (!document.head || document.getElementById("seer2-android-viewport")) {
            return;
        }
        const style = document.createElement("style");
        style.id = "seer2-android-viewport";
        style.textContent = `
            html,
            body {
                width: 100% !important;
                height: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                background: #000 !important;
            }
            object,
            embed,
            ruffle-player {
                max-width: 100vw !important;
                max-height: 100vh !important;
                max-width: 100dvw !important;
                max-height: 100dvh !important;
            }
        `;
        document.head.appendChild(style);
    };

    const ready = () => {
        installViewportFix();
        installExitButton();
        new MutationObserver(installExitButton).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ready, { once: true });
    } else {
        ready();
    }

    const waitForTauri = () =>
        new Promise((resolve) => {
            const startedAt = Date.now();
            const check = () => {
                const tauri = window.__TAURI__;
                if (tauri?.event?.listen) {
                    resolve(tauri.event.listen);
                    return;
                }
                if (Date.now() - startedAt > 5000) return;
                setTimeout(check, 25);
            };
            check();
        });

    waitForTauri().then((listen) => {
        listen("android_game_load_failed", (event) => showLoadFailure(event.payload));
    });

    window.__SEER2_ANDROID_SHOW_LOAD_FAILURE__ = showLoadFailure;

    window.addEventListener("error", (event) => {
        const target = event.target;
        if (target instanceof HTMLScriptElement && target.src.includes("ruffle.localhost")) {
            showLoadFailure("\u6e38\u620f\u8fd0\u884c\u7ec4\u4ef6\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u91cd\u65b0\u6253\u5f00\u5e94\u7528\u3002");
        }
    }, true);
})();"#;

pub(crate) fn init_script() -> &'static str {
    INIT_SCRIPT
}

pub(crate) fn is_allowed_navigation(url: &Url) -> bool {
    match url.scheme() {
        "about" | "blob" | "data" | "tauri" => return true,
        "http" | "https" => {}
        _ => return false,
    }

    matches!(
        url.host_str(),
        Some("seer2.localhost")
            | Some("ruffle.localhost")
            | Some("client.localhost")
            | Some("local.client")
            | Some("tauri.localhost")
            | Some("localhost")
            | Some("127.0.0.1")
    )
}

pub(crate) fn load_failed_script(message: &str) -> String {
    let message = serde_json::to_string(message).unwrap_or_else(|_| {
        "\"\\u6e38\\u620f\\u52a0\\u8f7d\\u5931\\u8d25\\uff0c\\u8bf7\\u68c0\\u67e5\\u7f51\\u7edc\\u540e\\u91cd\\u8bd5\\u3002\"".to_string()
    });
    format!(
        r#"(() => {{
            const show = () => {{
                if (window.__SEER2_ANDROID_SHOW_LOAD_FAILURE__) {{
                    window.__SEER2_ANDROID_SHOW_LOAD_FAILURE__({message});
                }} else if (window.AndroidSeer2?.showLoadFailureAndExit) {{
                    window.AndroidSeer2.showLoadFailureAndExit({message});
                }} else {{
                    alert({message});
                    window.__TAURI__?.core?.invoke?.("android_exit_game");
                }}
            }};
            if (document.readyState === "loading") {{
                document.addEventListener("DOMContentLoaded", show, {{ once: true }});
            }} else {{
                show();
            }}
        }})();"#
    )
}
