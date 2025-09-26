import {appWindow} from "./window";
import {appServer} from "./server";
import {app, BrowserWindow, Menu} from "electron";
import {ppapiFlashPath, runtime} from "./runtime";
import dns from "dns";
import {config} from "./config";
import {bloom} from "./utils";
import fetch from "node-fetch";

const createWindow = async () => {
    appWindow.create();
    updateWindowMenu();
    await load();
    await appServer.start();
    appWindow.load(config.entryUrl);
}

app.commandLine.appendSwitch('ppapi-flash-path', ppapiFlashPath);
app.on('ready', createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        exit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow().catch(err => console.error(err));
    }
});
const exit = () => {
    app.quit();
    appServer.close();
}
const updateWindowMenu = () => {
    const menu = Menu.buildFromTemplate([{
        label: '🙈主菜单',
        submenu: [{
            label: '刷新网页', click: () => appWindow.reload()
        }, {
            label: '★游戏主页', click: () => appWindow.load(config.entryUrl),
        }, {
            label: '★改服主页', click: () => appWindow.load(config.nextRootUrl),
        }, {
            label: '赛尔号，启动！', click: () => appWindow.load('https://seer.61.com/play.shtml'),
        }, {
            label: '原神，启动！', click: () => appWindow.load('https://ys.mihoyo.com/cloud/'),
        }, {
            label: '★下载更新',
            click: () => appWindow.load('https://github.com/arcadia-star/seer2-next-client-release/releases'),
        }, {
            label: '★下载更新(网盘)', click: () => appWindow.load('https://www.123865.com/s/QwODjv-AjoJh'),
        }, {
            label: '退出', click: exit,
        }]
    }, {
        label: '🙉调整窗口',
        submenu: [
            {label: '全屏', role: 'togglefullscreen'},
            {label: '控制台', role: 'toggleDevTools'},
            {label: '缩放=', role: 'resetZoom'},
            {label: '缩放+', role: 'zoomIn'},
            {label: '缩放-', role: 'zoomOut'},
            {label: '关于', role: 'about'}
        ]
    }]);
    Menu.setApplicationMenu(menu);
};

async function dnsLookup(host: string) {
    return new Promise((resolve, reject) => {
        dns.lookup(host, {}, (err, address) => {
            console.log('dns lookup: %s %j', host, address);
            if (err) {
                reject(err);
            } else {
                resolve(address);
            }
        });
    })
}

async function load() {
    const address = await dnsLookup(config.rootUrlHost);
    runtime.rootUrl = `http://${address}${config.rootUrlPath}`;

    const bloomText = await fetch(runtime.rootUrl + config.bloomPath).then(e => e.text());
    runtime.bloomContains = bloom(bloomText);
}