import {appWindow} from "./window";
import {appServer} from "./server";
import {app, dialog, Menu, session} from "electron";
import {
    APP_GAME_CACHE_PATH,
    APP_VERSION,
    BLOOM_PATH, cacheMetric, CacheMetricKey,
    DNS_ROOT,
    LOCAL_ENTRY_URL,
    LOCAL_MAGIC_URL, PPAPI_FLASH_DLLS,
    PPAPI_FLASH_PATH, queryMetric,
    runtime,
    SEER2_PATH
} from "./runtime";
import dns from "dns";
import {bloom} from "./utils";
import fetch from "node-fetch";
import {config, DynMenu} from "../config";
import fs from "fs";
import {syncUserData, userData} from "./userdata";

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
            label: `🙊缓存信息 [\
hit:${queryMetric(CacheMetricKey.Hit)},\
expired:${queryMetric(CacheMetricKey.Expired)},\
cached:${queryMetric(CacheMetricKey.Cache)},\
checked:${queryMetric(CacheMetricKey.Checked)},\
unchanged:${queryMetric(CacheMetricKey.Unchanged)},\
changed:${queryMetric(CacheMetricKey.Changed)}\
]`,
            submenu: [{
                label: '清空浏览器缓存', click() {
                    session.defaultSession.clearCache();
                }
            }, {
                label: '清空本地缓存(一般不用点)', click() {
                    fs.rmdir(APP_GAME_CACHE_PATH, {recursive: true}, (err) => err && console.log(err));
                }
            }]
        },
        {
            label: appServer.listening() ? '本地服务✅' : '本地服务❌'
        },
        {
            label: userData.proxyFileRoot ? (`本地代理✅(${userData.proxyFileRoot})`) : '本地代理❌',
            submenu: [
                {
                    label: '设置代理',
                    click() {
                        let dir = dialog.showOpenDialogSync({properties: ['openDirectory']});
                        console.info('open directory:' + dir);
                        if (dir) {
                            userData.proxyFileRoot = dir[0];
                            syncUserData();
                            updateWindowMenu();
                        }
                    }
                },
                {
                    label: '关闭代理', click() {
                        userData.proxyFileRoot = null;
                        syncUserData();
                        updateWindowMenu();
                    }
                }
            ]
        },
        {
            label: `flash: ${userData.ppapiFlash}`,
            submenu: [{label: '修改后重启生效'}].concat(PPAPI_FLASH_DLLS.map(e => ({
                label: e,
                click: () => {
                    userData.ppapiFlash = e;
                    syncUserData();
                    updateWindowMenu();
                }
            })))
        }
    ]);
    Menu.setApplicationMenu(menu);
}

cacheMetric.callback = updateWindowMenu;

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