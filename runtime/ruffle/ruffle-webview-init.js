(() => {
    const protocol = window.location.protocol;
    if (!["http:", "https:"].includes(protocol)) return;

    if (!window.__TAURI_FLASH_DETECTION_SHIM_INSTALLED__) {
        window.__TAURI_FLASH_DETECTION_SHIM_INSTALLED__ = true;

        const mimeType = {
            type: "application/x-shockwave-flash",
            suffixes: "swf",
            description: "Shockwave Flash"
        };
        const plugin = {
            name: "Shockwave Flash",
            filename: "pepflashplayer.dll",
            description: "Shockwave Flash 34.0 r0",
            length: 1,
            0: mimeType,
            item(index) {
                return index === 0 ? mimeType : null;
            },
            namedItem(name) {
                return name === mimeType.type ? mimeType : null;
            }
        };
        Object.defineProperty(mimeType, "enabledPlugin", {
            configurable: true,
            enumerable: true,
            value: plugin
        });

        const pluginArray = {
            length: 1,
            0: plugin,
            "Shockwave Flash": plugin,
            item(index) {
                return index === 0 ? plugin : null;
            },
            namedItem(name) {
                return this[name] || null;
            },
            refresh() {
            }
        };
        const mimeTypeArray = {
            length: 1,
            0: mimeType,
            "application/x-shockwave-flash": mimeType,
            item(index) {
                return index === 0 ? mimeType : null;
            },
            namedItem(name) {
                return this[name] || null;
            }
        };
        if (typeof Symbol !== "undefined") {
            pluginArray[Symbol.iterator] = function* () {
                yield plugin;
            };
            mimeTypeArray[Symbol.iterator] = function* () {
                yield mimeType;
            };
        }

        const defineNavigatorValue = (name, value) => {
            const target = Object.getPrototypeOf(navigator) || navigator;
            try {
                Object.defineProperty(target, name, {
                    configurable: true,
                    get: () => value
                });
            } catch {
                try {
                    Object.defineProperty(navigator, name, {
                        configurable: true,
                        get: () => value
                    });
                } catch {
                }
            }
        };
        defineNavigatorValue("plugins", pluginArray);
        defineNavigatorValue("mimeTypes", mimeTypeArray);

        if (!window.ActiveXObject) {
            Object.defineProperty(window, "ActiveXObject", {
                configurable: true,
                value(name) {
                    if (String(name).includes("ShockwaveFlash")) {
                        return {
                            GetVariable(variable) {
                                return variable === "$version" ? "WIN 34,0,0,0" : "";
                            }
                        };
                    }
                    throw new Error(`ActiveXObject is unavailable: ${name}`);
                }
            });
        }
    }

    if (!window.__TAURI_RUFFLE_BRIDGE_INSTALLED__) {
        window.__TAURI_RUFFLE_BRIDGE_INSTALLED__ = true;

        const socketHosts = new Set(["ruffle.localhost"]);
        const waitForTauri = () =>
            new Promise((resolve, reject) => {
                const startedAt = Date.now();
                const check = () => {
                    const tauri = window.__TAURI__;
                    if (tauri?.core?.invoke && tauri?.event?.listen) {
                        resolve({ invoke: tauri.core.invoke, listen: tauri.event.listen });
                        return;
                    }
                    if (Date.now() - startedAt > 5000) {
                        reject(new Error("Tauri JS API unavailable"));
                        return;
                    }
                    setTimeout(check, 25);
                };
                check();
            });

        const OriginalWebSocket = window.WebSocket;
        const connections = new Map();

        const bytesFrom = (data) => {
            if (typeof data === "string") {
                return Promise.resolve(Array.from(new TextEncoder().encode(data)));
            }
            if (data instanceof ArrayBuffer) {
                return Promise.resolve(Array.from(new Uint8Array(data)));
            }
            if (ArrayBuffer.isView(data)) {
                return Promise.resolve(Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
            }
            if (data instanceof Blob) {
                return data.arrayBuffer().then((buffer) => Array.from(new Uint8Array(buffer)));
            }
            return Promise.reject(new TypeError("Unsupported WebSocket payload type"));
        };

        class InterceptedWebSocket extends EventTarget {
            static CONNECTING = OriginalWebSocket.CONNECTING;
            static OPEN = OriginalWebSocket.OPEN;
            static CLOSING = OriginalWebSocket.CLOSING;
            static CLOSED = OriginalWebSocket.CLOSED;

            constructor(url, protocols) {
                super();
                this.url = String(url);
                try {
                    const parsed = new URL(this.url, window.location.href);
                    if (!socketHosts.has(parsed.hostname)) {
                        return new OriginalWebSocket(url, protocols);
                    }
                } catch {
                    return new OriginalWebSocket(url, protocols);
                }
                this.protocol = Array.isArray(protocols) ? protocols[0] || "" : protocols || "";
                this.extensions = "";
                this.binaryType = "blob";
                this.bufferedAmount = 0;
                this.readyState = OriginalWebSocket.CONNECTING;
                this.onopen = null;
                this.onmessage = null;
                this.onerror = null;
                this.onclose = null;
                this.connId = null;
                this.unlisten = null;
                this.closeUnlisten = null;

                waitForTauri()
                    .then(({ invoke, listen }) =>
                        invoke("ruffle_register_ws", { url: this.url }).then(async (connId) => {
                            this.connId = connId;
                            connections.set(connId, this);
                            this.unlisten = await listen(`ws_${connId}`, (event) =>
                                this.dispatchMessage(event.payload)
                            );
                            this.closeUnlisten = await listen(`ws_close_${connId}`, () =>
                                this.finishClose(1000, "remote closed")
                            );
                            this.readyState = OriginalWebSocket.OPEN;
                            this.dispatchOpen();
                        })
                    )
                    .catch((error) => {
                        this.dispatchError(error);
                        this.finishClose(1000, "register failed");
                    });
            }

            send(data) {
                if (this.readyState !== OriginalWebSocket.OPEN || !this.connId) {
                    throw new DOMException("WebSocket is not open", "InvalidStateError");
                }
                Promise.all([waitForTauri(), bytesFrom(data)])
                    .then(([{ invoke }, message]) =>
                        invoke("ruffle_ws_send", { connId: this.connId, message })
                    )
                    .catch((error) => this.dispatchError(error));
            }

            close(code = 1000, reason = "") {
                if (this.readyState === OriginalWebSocket.CLOSED) return;
                this.readyState = OriginalWebSocket.CLOSING;
                if (this.connId) {
                    waitForTauri()
                        .then(({ invoke }) => invoke("ruffle_ws_close", { connId: this.connId }))
                        .finally(() => this.finishClose(code, reason));
                } else {
                    this.finishClose(code, reason);
                }
            }

            finishClose(code = 1000, reason = "") {
                if (this.readyState === OriginalWebSocket.CLOSED) return;
                this.readyState = OriginalWebSocket.CLOSED;
                this.unlisten?.();
                this.closeUnlisten?.();
                if (this.connId) connections.delete(this.connId);
                this.dispatchClose(code, reason);
            }

            dispatchOpen() {
                const event = new Event("open");
                this.onopen?.call(this, event);
                this.dispatchEvent(event);
            }

            dispatchMessage(payload) {
                if (this.readyState === OriginalWebSocket.CLOSED) return;
                const bytes = new Uint8Array(payload);
                const data = this.binaryType === "arraybuffer" ? bytes.buffer : new Blob([bytes]);
                const event = new MessageEvent("message", { data });
                this.onmessage?.call(this, event);
                this.dispatchEvent(event);
            }

            dispatchError(error) {
                const event = new ErrorEvent("error", { error, message: String(error) });
                this.onerror?.call(this, event);
                this.dispatchEvent(event);
            }

            dispatchClose(code = 1000, reason = "") {
                const event = new CloseEvent("close", { code, reason, wasClean: true });
                this.onclose?.call(this, event);
                this.dispatchEvent(event);
            }
        }

        InterceptedWebSocket.prototype.CONNECTING = OriginalWebSocket.CONNECTING;
        InterceptedWebSocket.prototype.OPEN = OriginalWebSocket.OPEN;
        InterceptedWebSocket.prototype.CLOSING = OriginalWebSocket.CLOSING;
        InterceptedWebSocket.prototype.CLOSED = OriginalWebSocket.CLOSED;
        window.WebSocket = InterceptedWebSocket;
    }

    window.RufflePlayer = window.RufflePlayer || {};
    const config = window.RufflePlayer.config || {};
    window.RufflePlayer.config = {
        ...config,
        favorFlash: false,
        polyfills: true,
        publicPath: "http://ruffle.localhost/ruffle/web/",
        fontSources: ["http://ruffle.localhost/ruffle/FallbackFont.swf"],
        httpProxy: [
            ...(config.httpProxy || []),
            { origin: "*", proxyUrl: "http://ruffle.localhost/ruffle-proxy/" }
        ],
        socketProxy: [
            ...(config.socketProxy || []),
            { host: "*", port: 0, proxyUrl: "ws://ruffle.localhost/ruffle-socket/" }
        ],
        defaultFonts: {
            ...(config.defaultFonts || {}),
            sans: ["fallback"]
        }
    };

    if (!window.__TAURI_RUFFLE_SCRIPT_INJECTED__) {
        window.__TAURI_RUFFLE_SCRIPT_INJECTED__ = true;
        const injectRuffle = () => {
            if (!document.head) {
                setTimeout(injectRuffle, 0);
                return;
            }
            const script = document.createElement("script");
            script.src = "http://ruffle.localhost/ruffle/web/ruffle.js";
            script.async = false;
            document.head.appendChild(script);
        };
        injectRuffle();
    }
})();
