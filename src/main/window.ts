import {BrowserWindow} from 'electron';
import path from 'path';

import {WINDOW_ICON, WINDOW_TITLE} from './runtime'

let mainWindow: BrowserWindow;

function create() {
    mainWindow = new BrowserWindow({
        title: WINDOW_TITLE,
        useContentSize: true,
        width: 1200,
        height: 660,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/index.js'),
            plugins: true,
        },
        icon: WINDOW_ICON,
    }).on('page-title-updated', (evt) => {
        evt.preventDefault();
    });
}

function load(url: string) {
    mainWindow?.loadURL(url).catch(err => console.log(err));
}

function reload() {
    mainWindow?.reload();
}

export const appWindow = {create, load, reload};
