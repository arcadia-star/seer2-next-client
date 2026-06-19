#[cfg(test)]
pub(crate) const INIT_PATH: &str = "/ruffle/ruffle-webview-init.js";

const INIT_URL: &str = "http://ruffle.localhost/ruffle/ruffle-webview-init.js";

const BOOTSTRAP_SCRIPT_TEMPLATE: &str = r#"(() => {
    const protocol = window.location.protocol;
    if (!["http:", "https:"].includes(protocol)) return;

    if (window.__TAURI_RUFFLE_WEBVIEW_INIT_LOADER_INSTALLED__) return;
    window.__TAURI_RUFFLE_WEBVIEW_INIT_LOADER_INSTALLED__ = true;

    const src = "__RUFFLE_WEBVIEW_INIT_URL__";
    try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", src, false);
        xhr.send();
        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
            (0, eval)(`${xhr.responseText}
//# sourceURL=${src}`);
            return;
        }
        console.error(`Failed to load Ruffle init script: ${xhr.status} ${xhr.statusText}`);
    } catch (error) {
        console.error("Failed to load Ruffle init script synchronously", error);
    }

    const inject = () => {
        if (Array.from(document.scripts).some((script) => script.src === src)) return;

        const parent = document.head || document.documentElement || document.body;
        if (!parent) {
            setTimeout(inject, 0);
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        parent.appendChild(script);
    };
    inject();
})();"#;

pub(crate) fn bootstrap_script() -> String {
    BOOTSTRAP_SCRIPT_TEMPLATE.replace("__RUFFLE_WEBVIEW_INIT_URL__", INIT_URL)
}

#[cfg(test)]
mod tests {
    use super::{bootstrap_script, INIT_URL};

    #[test]
    fn bootstrap_loads_runtime_init_script() {
        let script = bootstrap_script();
        assert!(script.contains(INIT_URL));
        assert!(script.contains("XMLHttpRequest"));
        assert!(script.contains("xhr.open(\"GET\", src, false)"));
        assert!(!script.contains("document.write"));
        assert!(!script.contains("ruffle_register_ws"));
    }
}
