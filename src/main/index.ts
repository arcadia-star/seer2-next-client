import dns from "dns";
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } from "electron";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { config, DynMenu } from "../config";
import {
    APP_GAME_CACHE_PATH,
    APP_RESOURCES_PATH,
    APP_VERSION,
    BLOOM_PATH,
    cacheMetric,
    CacheMetricKey,
    CLIENT_CONFIG_PATH,
    DNS_ROOT,
    LOCAL_ENTRY_URL_WITH_VERSION,
    LOCAL_PROTOCOL,
    PPAPI_FLASH_DLLS,
    PPAPI_FLASH_PATH,
    queryMetric,
    runtime,
    SEER2_PATH,
} from "./runtime";
import { appServer } from "./server";
import { onGameReload, registerSpeedIpc } from "./speed";
import { syncUserData, userData } from "./userdata";
import { bloom } from "./utils";
import { appWindow } from "./window";

protocol.registerSchemesAsPrivileged([
    {
        scheme: LOCAL_PROTOCOL,
        privileges: {
            standard: true,
            secure: true,
            allowServiceWorkers: true,
            supportFetchAPI: true,
        },
    },
]);

// ── 变速面板窗口 ──────────────────────────────────────────────────────────
// 参考包移植的 overlay 架构：
//   - 无 blur 处理器：失焦后靠 game-window-click IPC 关闭，不抢焦点
//   - showInactive()：ShowWindow(SW_SHOWNOACTIVATE)，不发 WM_ACTIVATE 激活消息，
//     彻底消除多窗口互闪和焦点抢夺问题
//   - _speedWinPinned：主进程侧 pin 状态，与 overlay JS 同步
//   - _speedWinClosing：防止 close 重复触发
// 点击游戏窗口 → preload.ts mousedown → game-window-click IPC
// → closeUnpinnedSpeedWin() → 关闭未钉住的变速面板
let speedWin: BrowserWindow | null = null;
let _speedWinPinned  = false;
let _speedWinClosing = false;

function closeUnpinnedSpeedWin(): void {
    if (!speedWin || speedWin.isDestroyed() || _speedWinClosing) return;
    if (_speedWinPinned) return;
    _speedWinClosing = true;
    speedWin.close();
}

function openSpeedPanel(): void {
    // toggle：面板存在 → 关闭；不存在 → 创建
    if (speedWin && !speedWin.isDestroyed()) {
        if (speedWin.isMinimized()) {
            speedWin.restore();
            speedWin.focus();
        } else {
            if (!_speedWinClosing) { _speedWinClosing = true; speedWin.close(); }
        }
        return;
    }

    _speedWinPinned  = false;
    _speedWinClosing = false;

    speedWin = new BrowserWindow({
        title: "游戏变速(春树哥哥特供)",
        width: 420,
        height: 300,
        minWidth: 280,
        minHeight: 260,
        resizable: true,
        frame: false,
        transparent: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        show: false,
        backgroundColor: '#0a0e1a', // 与 overlay CSS --bg 一致，消除白色闪烁
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, "../preload/index.js"),
            nodeIntegration: false,
        },
    });

    const overlayPath = app.isPackaged
        ? path.join(APP_RESOURCES_PATH, "speed-overlay.html")
        : path.join(app.getAppPath(), "resources", "speed-overlay.html");

    speedWin.loadFile(overlayPath).catch((e) =>
        dialog.showErrorBox("变速面板加载失败", e.message),
    );

    // did-finish-load 后用 showInactive() 显示：
    //   show() → SetForegroundWindow() → WM_ACTIVATE → 主窗口闪烁
    //   showInactive() → SW_SHOWNOACTIVATE → 无激活消息 → 无闪烁
    speedWin.webContents.once("did-finish-load", () => {
        const w = speedWin;
        if (!w || w.isDestroyed()) return;
        w.showInactive();   // 不抢焦点，不发 WM_ACTIVATE
        w.moveTop();        // 提升到 Z 序顶层（不设 alwaysOnTop）
    });

    // ── 无 blur 处理器 ────────────────────────────────────────────────────
    // 失焦由 game-window-click IPC 驱动（preload.ts mousedown → closeUnpinnedSpeedWin）
    // 移除 blur 的好处：
    //   1. 点菜单栏不触发意外关闭
    //   2. 不需要防抖 _blurCloseTime 机制
    //   3. 未钉住时窗口随 Z 序自然下沉，不遮挡游戏，OBS 仍可捕获

    // 主窗口关闭时联动关闭变速面板
    const mw = appWindow.getWindow();
    if (mw) {
        mw.once("closed", () => {
            if (speedWin && !speedWin.isDestroyed()) speedWin.destroy();
        });
    }

    speedWin.on("closed", () => {
        try { speedWin?.webContents.removeAllListeners(); } catch (_) {}
        try { speedWin?.removeAllListeners(); } catch (_) {}
        speedWin         = null;
        _speedWinPinned  = false;
        _speedWinClosing = false;
    });
}

function sendToSpeedPanel(channel: string, data: unknown): void {
    if (speedWin && !speedWin.isDestroyed()) {
        speedWin.webContents.send(channel, data);
    }
}

// ── overlay 辅助 IPC ──────────────────────────────────────────────────────
ipcMain.on("overlay-minimize-self", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on("overlay-set-pinned", (_event, pinned: boolean) => {
    _speedWinPinned = pinned;
    if (speedWin && !speedWin.isDestroyed()) {
        speedWin.setAlwaysOnTop(pinned);
    }
});
// 游戏主窗口点击 → 关闭未钉住的变速面板（由 preload.ts mousedown 触发）
ipcMain.on("game-window-click", () => {
    closeUnpinnedSpeedWin();
});

// no-sandbox: 禁用 Chromium 沙箱，PPAPI Plugin 进程以完整令牌运行。
// 这是 LoadLibraryW 远程线程注入能够成功的前提条件：
// 沙箱激活时 PPAPI 进程的受限令牌无权访问 App 资源目录，导致 ERROR_ACCESS_DENIED(5)。
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('ppapi-flash-path', PPAPI_FLASH_PATH);
// --ppapi-flash-version 告知 Chromium 这是 Flash 插件，应用正确（宽松）的 Flash 沙箱策略
// 缺少版本号时 Chromium 87 对 PPAPI 插件应用最保守的通用沙箱，会阻止 DLL 加载
const _flashVerMatch = PPAPI_FLASH_PATH.match(/pepflashplayer\d+_(\d+_\d+_\d+_\d+)\.dll/i);
if (_flashVerMatch) {
    app.commandLine.appendSwitch("ppapi-flash-version", _flashVerMatch[1].replace(/_/g, '.'));
}
app.on("ready", () => {
    protocol.interceptBufferProtocol(LOCAL_PROTOCOL, appServer.createBufferProtocol(LOCAL_PROTOCOL));

    // 注册变速 IPC
    registerSpeedIpc();

    appWindow.create();

    // ── 主窗口 webContents 事件：刷新/导航时重置变速 ─────────────────────
    // 必须在 appWindow.create() 之后立即注册，直接挂到主窗口的 webContents 上。
    //
    // ❌ 错误做法：app.on("web-contents-created", ...) 注册在 create() 之后
    //    web-contents-created 是同步事件，BrowserWindow 构造时即触发。
    //    监听器晚一步注册，主窗口的 webContents 永远捕获不到，
    //    导致 did-finish-load / did-navigate 回调从未触发，onGameReload 失效。
    //
    // ✅ 正确做法：create() 后立即拿到 webContents 并直接注册。
    {
        const mwc = appWindow.getWindow()!.webContents;

        // did-navigate：★游戏主页 / 其他菜单 URL 跳转
        mwc.on("did-navigate", () => {
            onGameReload(sendToSpeedPanel);
        });

        // did-finish-load：捕获 role:'reload'（刷新网页 Ctrl+R）和 webContents.reload()
        // Electron 11 的 reload() 不产生 did-navigate，但一定产生 did-finish-load。
        // 防抖：首次加载（appWindow.load → loadURL 完成）不触发重置，
        //       后续每次 did-finish-load 才真正重置变速。
        let _firstLoad = true;
        mwc.on("did-finish-load", () => {
            if (_firstLoad) { _firstLoad = false; return; }  // 跳过首次加载
            onGameReload(sendToSpeedPanel);
        });
    }

    updateWindowMenu();
    init()
        .then(() => { appWindow.load(LOCAL_ENTRY_URL_WITH_VERSION); })
        .catch((err) => {
            dialog.showErrorBox("初始化失败", err.message);
            app.quit();
        });
});
app.on("window-all-closed", () => {
    app.quit();
    appServer.close().catch();
});

function updateWindowMenu() {
    function buildMenu(menu: DynMenu): any {
        const label = menu.label;
        if (menu.url) { return { label, click: () => appWindow.load(menu.url) }; }
        if (menu.externalUrl) { return { label, click: () => shell.openExternal(menu.externalUrl) }; }
        if (menu.role) { return { label, role: menu.role }; }
        if (menu.submenu?.length) { return { label, submenu: menu.submenu.map(buildMenu) }; }
        return { label: "❓" };
    }

    const menuFromConfig = config.menus.map(buildMenu);
    const menu = Menu.buildFromTemplate([
        ...menuFromConfig,
        {
            label: `🍪\
hit:${queryMetric(CacheMetricKey.Hit)}, \
expired:${queryMetric(CacheMetricKey.Expired)}, \
fetch:${queryMetric(CacheMetricKey.Fetch)}, \
cached:${queryMetric(CacheMetricKey.Cache)}, \
checked:${queryMetric(CacheMetricKey.Checked)}, \
unchanged:${queryMetric(CacheMetricKey.Unchanged)}, \
changed:${queryMetric(CacheMetricKey.Changed)}\
`,
            submenu: [
                {
                    label: "清空缓存(浏览器)",
                    click() {
                        session.defaultSession.clearCache().catch();
                        init().catch((err) => { dialog.showErrorBox("操作失败", err.message); });
                    },
                },
                {
                    label: "清空缓存(文件缓存)⚠️",
                    click() {
                        if (!appWindow.confirm("操作确认", "清空文件缓存会影响性能，是否继续")) return;
                        fs.rmdir(APP_GAME_CACHE_PATH, { recursive: true }, (err) => {
                            err && dialog.showErrorBox("操作失败", err.message);
                        });
                    },
                },
            ],
        },
        {
            label: (appServer.locking() ? "❓" : appServer.listening() ? "✅" : "❌") + "本地服务",
            click: async () => {
                if (appServer.locking()) { dialog.showErrorBox("禁止执行操作", "处理中，请等待"); return; }
                if (appServer.listening()) {
                    appServer.close()
                        .catch((err: Error) => dialog.showErrorBox("服务关闭失败", err.message))
                        .then(updateWindowMenu);
                } else {
                    appServer.start()
                        .catch((err: Error) => dialog.showErrorBox("服务启动失败", err.message))
                        .then(updateWindowMenu);
                }
                updateWindowMenu();
            },
        },
        {
            label: userData.proxyFileRoot ? `✅本地代理(${userData.proxyFileRoot})` : "❌本地代理",
            click: async () => {
                if (userData.proxyFileRoot) {
                    userData.proxyFileRoot = null;
                    syncUserData().catch((err: Error) => dialog.showErrorBox("数据同步失败", err.message));
                } else {
                    const dir = dialog.showOpenDialogSync({ properties: ["openDirectory"] });
                    console.info("open directory:" + dir);
                    if (dir) {
                        userData.proxyFileRoot = dir[0];
                        syncUserData().catch((err: Error) => dialog.showErrorBox("数据同步失败", err.message));
                    }
                }
                session.defaultSession.clearCache().catch();
                updateWindowMenu();
            },
        },
        {
            label: "🛠️扩展功能",
            submenu: [
                {
                    label: (protocol.isProtocolIntercepted(LOCAL_PROTOCOL) ? "✅" : "❌") + "HTTP拦截",
                    click: () => {
                        if (protocol.isProtocolIntercepted(LOCAL_PROTOCOL)) {
                            protocol.uninterceptProtocol(LOCAL_PROTOCOL);
                        } else {
                            protocol.interceptBufferProtocol(
                                LOCAL_PROTOCOL,
                                appServer.createBufferProtocol(LOCAL_PROTOCOL),
                            );
                        }
                        updateWindowMenu();
                    },
                },
                {
                    label: `🎬${userData.ppapiFlash}`,
                    submenu: PPAPI_FLASH_DLLS.map((name) => ({
                        label: name,
                        click: async () => {
                            userData.ppapiFlash = name;
                            await syncUserData();
                            app.relaunch();
                            app.quit();
                        },
                        type: "radio",
                        checked: name === userData.ppapiFlash,
                    })),
                },
            ],
        },
        // ── 变速功能入口 ──────────────────────────────────────────────────
        {
            label: "⚡ 变速",
            click: openSpeedPanel,
        },
    ]);
    Menu.setApplicationMenu(menu);
}

cacheMetric.callback = updateWindowMenu;

async function dnsLookup(host: string) {
    return new Promise((resolve, reject) => {
        dns.lookup(host, {}, (err, address) => {
            console.log("dns lookup: %s %j", host, address);
            if (err) { reject(err); } else { resolve(address); }
        });
    });
}

async function init() {
    const address = await dnsLookup(DNS_ROOT);
    runtime.rootUrl = `http://${address}${SEER2_PATH}`;

    const bloomText = await fetch(runtime.rootUrl + BLOOM_PATH)
        .catch(() => Promise.reject(new Error("版控文件加载失败，请检查网络后重试")))
        .then((e) => e.text());
    try {
        runtime.bloomContains = bloom(bloomText);
    } catch {
        return Promise.reject(new Error("版控文件解析失败，请联系项目组反馈"));
    }

    if (!runtime.bloomContains("/version/seer2-next-client/v" + APP_VERSION)) {
        await shell.openExternal("https://github.com/arcadia-star/seer2-next-client-release/releases").catch();
        return Promise.reject(new Error("当前版本已被禁用，建议下载最新版本"));
    }

    await fetch(runtime.rootUrl + CLIENT_CONFIG_PATH)
        .then((e) => e.json())
        .then((e) => (config.menus = e.menus))
        .catch();
}
