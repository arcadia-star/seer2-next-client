import {appWindow} from "./window";
import {appServer} from "./server";
import {app, Menu} from "electron";
import {
    APP_VERSION,
    BLOOM_PATH,
    DNS_ROOT,
    LOCAL_ENTRY_URL,
    LOCAL_MAGIC_URL,
    PPAPI_FLASH_PATH, runtime,
    SEER2_PATH
} from "./runtime";
import dns from "dns";
import {bloom} from "./utils";
import fetch from "node-fetch";

app.commandLine.appendSwitch('ppapi-flash-path', PPAPI_FLASH_PATH);
app.on('ready', () => {
    appWindow.create();
    appWindow.load(LOCAL_ENTRY_URL);
});
app.on('window-all-closed', () => {
    app.quit();
    appServer.close();
});

const updateWindowMenu = () => {
    const menu = Menu.buildFromTemplate([{
        label: '🙈主菜单',
        submenu: [{
            label: '刷新网页', click: () => appWindow.reload()
        }, {
            label: '★游戏主页', click: () => appWindow.load(LOCAL_ENTRY_URL),
        }, {
            label: '★改服主页', click: () => appWindow.load("http://733702.xyz"),
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
            label: '退出', role: 'close',
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
    }, {
        label: 'server:' + appServer.listening(),
    }]);
    Menu.setApplicationMenu(menu);
};
setInterval(updateWindowMenu, 1000);

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
    const address = await dnsLookup(DNS_ROOT);
    runtime.rootUrl = `http://${address}${SEER2_PATH}`;

    const bloomText = await fetch(runtime.rootUrl + BLOOM_PATH).then(e => e.text());
    runtime.bloomContains = bloom(bloomText);

    //强版控
    if (!runtime.bloomContains('/version/seer2-next-client/v' + APP_VERSION)) {
        // return Promise.reject({
        //     msg: '当前版本已被禁用, 建议下载最新版本',
        //     openExternal: 'https://github.com/arcadia-star/seer2-next-client-release/releases'
        // });
    }

    await appServer.start().catch(async (err) => {
        if (err.code === 'EADDRINUSE') {
            const responseVersion = await fetch(LOCAL_MAGIC_URL)
                .then(e => e.json())
                .then(e => e.version)
                .catch((err) => console.error(err));
            if (responseVersion === APP_VERSION) {
                console.log("start without server");
            } else {
                throw new Error(`Magic version not match, version: ${responseVersion}`);
            }
        } else {
            throw err;
        }
    });
}

load();