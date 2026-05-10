// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";

console.log("preload-scripts...");

// ── 游戏主窗口：点击时通知主进程关闭未钉住的 overlay ─────────────────────────
// 仅对游戏窗口（http: 协议）生效；speed-overlay.html 等通过 loadFile 加载，
// 协议为 file:，不会触发此监听，避免点击 overlay 内部时意外关闭自身。
if (window.location.protocol !== 'file:') {
    document.addEventListener('mousedown', () => {
        ipcRenderer.send('game-window-click');
    }, true); // capture phase — 在游戏自身的事件处理之前触发
}

contextBridge.exposeInMainWorld("myAPI", {
    desktop: true,

    // ── 变速 API ──────────────────────────────────────────────────────────
    /** 设置游戏速度倍率（0.1 ~ 3.0） */
    setGameSpeed: (factor: number) =>
        ipcRenderer.invoke("set-game-speed", factor),

    /** 查询当前变速状态 */
    getGameSpeed: () =>
        ipcRenderer.invoke("get-game-speed"),

    /** 监听主进程发出的变速重置事件（页面 reload 时触发） */
    onSpeedReset: (cb: (d: { speed: number }) => void) =>
        ipcRenderer.on("speed-reset", (_event, d) => cb(d)),

    // ── overlay 窗口辅助 ──────────────────────────────────────────────────
    /** 最小化当前 overlay 窗口自身 */
    minimizeSelf: () =>
        ipcRenderer.send("overlay-minimize-self"),

    /** 设置 overlay 是否钉住（alwaysOnTop） */
    setOverlayPinned: (pinned: boolean) =>
        ipcRenderer.send("overlay-set-pinned", pinned),
});
