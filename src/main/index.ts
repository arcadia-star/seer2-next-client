import {appWindow} from "./window";
import {appServer} from "./server";
import {app, Menu} from "electron";
import {
    APP_VERSION,
    BLOOM_PATH,
    DNS_ROOT,
    LOCAL_ENTRY_URL,
    LOCAL_MAGIC_URL,
    PPAPI_FLASH_PATH,
    runtime,
    SEER2_PATH
} from "./runtime";
import dns from "dns";
import {bloom} from "./utils";
import fetch from "node-fetch";
import {config, DynMenu} from "../config";

app.commandLine.appendSwitch('ppapi-flash-path', PPAPI_FLASH_PATH);
app.on('ready', () => {
    appWindow.create();
    updateWindowMenu();
    appWindow.load(LOCAL_ENTRY_URL);
});
app.on('window-all-closed', () => {
    app.quit();
    appServer.close();
});

function updateWindowMenu() {
    function buildMenu(menu: DynMenu): any {
        const label = menu.label;
        if (menu.url) {
            return {label, click: () => appWindow.load(menu.url)};
        }
        if (menu.role) {
            return {label, role: menu.role};
        }
        if (menu.submenu?.length) {
            return {label, submenu: menu.submenu.map(buildMenu)};
        }
        return {label: '❓'}
    }

    const menuFromConfig = config.menus.map(buildMenu);
    const menu = Menu.buildFromTemplate([
        ...menuFromConfig,
        {
            label: appServer.listening() ? '本地服务✅' : '本地服务❌'
        }
    ]);
    Menu.setApplicationMenu(menu);
}

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