import {appWindow} from "./window";
import {appServer} from "./server";
import {app, dialog, Menu, session, shell} from "electron";
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
    init()
        .then(() => {
            appWindow.load(LOCAL_ENTRY_URL);
        })
        .catch(err => {
            dialog.showErrorBox("初始化失败", err.message);
            app.quit();
        });
});
app.on('window-all-closed', () => {
    app.quit();
    appServer.close().catch();
});

function updateWindowMenu() {
    function buildMenu(menu: DynMenu): any {
        const label = menu.label;
        if (menu.url) {
            return {label, click: () => appWindow.load(menu.url)};
        }
        if (menu.externalUrl) {
            return {label, click: () => shell.openExternal(menu.externalUrl)};
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
            label: `🍪\
hit:${queryMetric(CacheMetricKey.Hit)}, \
expired:${queryMetric(CacheMetricKey.Expired)}, \
cached:${queryMetric(CacheMetricKey.Cache)}, \
checked:${queryMetric(CacheMetricKey.Checked)}, \
unchanged:${queryMetric(CacheMetricKey.Unchanged)}, \
changed:${queryMetric(CacheMetricKey.Changed)}\
`,
            submenu: [{
                label: '清空缓存(浏览器)', click() {
                    session.defaultSession.clearCache().catch();
                }
            }, {
                label: '清空缓存(文件缓存)⚠️', click() {
                    if (!appWindow.confirm('操作确认', '清空文件缓存会影响性能，是否继续')) {
                        return;
                    }
                    fs.rmdir(APP_GAME_CACHE_PATH, {recursive: true}, (err) => {
                        err && dialog.showErrorBox('操作失败', err.message)
                    });
                }
            }]
        },
        {
            label: (appServer.locking() ? '❓' : (appServer.listening() ? '✅' : '❌')) + '本地服务',
            click: async () => {
                if (appServer.locking()) {
                    dialog.showErrorBox('禁止执行操作', '处理中，请等待');
                    return;
                }
                if (appServer.listening()) {
                    appServer.close().catch((err: Error) => dialog.showErrorBox('服务关闭失败', err.message)).then(updateWindowMenu);
                } else {
                    appServer.start().catch((err: Error) => dialog.showErrorBox('服务启动失败', err.message)).then(updateWindowMenu);
                }
                updateWindowMenu();
            }
        },
        {
            label: userData.proxyFileRoot ? (`✅本地代理(${userData.proxyFileRoot})`) : '❌本地代理',
            click: async () => {
                if (userData.proxyFileRoot) {
                    userData.proxyFileRoot = null;
                    syncUserData().catch((err: Error) => dialog.showErrorBox('数据同步失败', err.message));
                } else {
                    let dir = dialog.showOpenDialogSync({properties: ['openDirectory']});
                    console.info('open directory:' + dir);
                    if (dir) {
                        userData.proxyFileRoot = dir[0];
                        syncUserData().catch((err: Error) => dialog.showErrorBox('数据同步失败', err.message));
                    }
                }
                updateWindowMenu();
            }
        },
        {
            label: `🎬${userData.ppapiFlash}`,
            submenu: PPAPI_FLASH_DLLS.map(name => ({
                label: name + (name === userData.ppapiFlash ? '✅' : ''),
                click: async () => {
                    userData.ppapiFlash = name;
                    await syncUserData();
                    app.relaunch();
                    app.quit();
                },
            }))
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

async function init() {
    const address = await dnsLookup(DNS_ROOT);
    runtime.rootUrl = `http://${address}${SEER2_PATH}`;

    const bloomText = await fetch(runtime.rootUrl + BLOOM_PATH)
        .catch(() => Promise.reject(new Error('版控文件加载失败，请检查网络后重试')))
        .then(e => e.text());
    try {
        runtime.bloomContains = bloom(bloomText);
    } catch {
        return Promise.reject(new Error('版控文件解析失败，请联系项目组反馈'))
    }

    //强版控
    if (!runtime.bloomContains('/version/seer2-next-client/v' + APP_VERSION)) {
        await shell.openExternal('https://github.com/arcadia-star/seer2-next-client-release/releases').catch();
        return Promise.reject(new Error('当前版本已被禁用，建议下载最新版本'));
    }

    return appServer.start().catch(async (err) => {
        if (err.code === 'EADDRINUSE') {
            const responseVersion = await fetch(LOCAL_MAGIC_URL)
                .then(e => e.json())
                .then(e => e.version)
                .catch((err) => console.error(err));
            if (responseVersion === APP_VERSION) {
                console.log("start without server");
                return;
            }
        }
        throw err;
    });
}
