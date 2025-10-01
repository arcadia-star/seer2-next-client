import { BrowserWindow, dialog } from "electron";
import path from "path";

import { WINDOW_ICON, WINDOW_TITLE } from "./runtime";

let mainWindow: BrowserWindow;

function create() {
    mainWindow = new BrowserWindow({
        title: WINDOW_TITLE,
        useContentSize: true,
        width: 1200,
        height: 660,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, "../preload"),
            plugins: true,
        },
        icon: WINDOW_ICON,
    }).on("page-title-updated", (evt) => {
        evt.preventDefault();
    });
}

function load(url: string) {
    mainWindow?.loadURL(url).catch((err) => console.log(err));
}

function reload() {
    mainWindow?.reload();
}

function close() {
    if (mainWindow) {
        return;
    }
    mainWindow.close();
    mainWindow = null;
}

async function confirm(title: string, message: string) {
    const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: ["确认", "取消"],
        defaultId: 0,
        cancelId: 1,
        title,
        message,
    });
    return result.response === 0;
}

export const appWindow = { create, load, reload, close, confirm };
