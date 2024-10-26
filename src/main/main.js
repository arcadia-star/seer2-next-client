const {app, BrowserWindow, Menu, dialog, shell, session, nativeImage} = require('electron');
const openAboutWindow = require("about-window").default;

const fs = require("fs");
const path = require("path");

const config = require('./config');
const runtime = require('./runtime');
const server = require('./server');
const userData = require('./userdata');

const appIcon = nativeImage.createFromPath(path.resolve(__dirname, '../../build/icons/256x256.png'));

//界面程序
(() => {
    runtime.app = app;
    app.allowRendererProcessReuse = true;
    app.commandLine.appendSwitch('ppapi-flash-path', ppapiFlashPath());
    app.on('ready', function () {
        runtime.cacheMetric.updateDisplay = () => {
            let menu = [{
                label: '🙈主菜单',
                submenu: [{
                    label: '刷新网页', click() {
                        runtime.win.reload();
                    }
                }, {
                    label: '★游戏主页', click() {
                        runtime.load(config.entryUrl);
                    }
                }, {
                    label: '★改服主页', click() {
                        runtime.load(config.nextRootUrl);
                    }
                }, {
                    label: '赛尔号，启动！', click() {
                        runtime.load('https://seer.61.com/play.shtml');
                    }
                }, {
                    label: '原神，启动！', click() {
                        runtime.load('https://ys.mihoyo.com/cloud/');
                    }
                }, {
                    label: '★下载更新', click() {
                        runtime.load('https://github.com/arcadia-star/seer2-next-client-release/releases')
                    }
                }, {
                    label: '退出', click() {
                        runtime.exit();
                    }
                }]
            }, {
                label: '🙉调整窗口',
                submenu: [
                    {
                        label: 'Reset',
                        click() {
                            runtime.win.setContentSize(1200, 660, true);
                        }
                    },
                    {
                        label: 'DevTools', click() {
                            runtime.win.webContents.openDevTools({mode: 'detach'});
                        }
                    },
                    {
                        label: 'Abort', click() {
                            openAboutWindow({
                                icon_path: pathResolve('common/256x256xR.png'),
                                use_version_info: true,
                            });
                        }
                    }
                ]
            }, {
                label: `🙊缓存信息 [hit:${runtime.cacheMetric.hit}, expired:${runtime.cacheMetric.expire}, cached:${runtime.cacheMetric.cache}`
                    + `, check:${runtime.cacheMetric.check}, unchanged:${runtime.cacheMetric.unchanged}, changed:${runtime.cacheMetric.changed}]`,
                submenu: [{
                    label: '清空浏览器缓存', click() {
                        session.defaultSession.clearCache();
                    }
                }, {
                    label: '清空本地缓存(一般不用点)', click() {
                        fs.rmdir(config.cacheFolderRoot, {recursive: true}, (err) => err && console.log(err));
                    }
                }]
            }, {
                label: '🐵本地代理 ' + (runtime.proxyFileRoot ?? 'close'),
                submenu: [
                    {
                        label: '设置代理',
                        click() {
                            let dir = dialog.showOpenDialogSync({properties: ['openDirectory']});
                            console.info('open directory:' + dir);
                            if (dir) {
                                runtime.proxyFileRoot = dir[0];
                            }
                            runtime.cacheMetric.updateDisplay();
                        }
                    },
                    {
                        label: '关闭代理', click() {
                            runtime.proxyFileRoot = null;
                            runtime.cacheMetric.updateDisplay();
                        }
                    }
                ]
            }]
            Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
        }
        runtime.cacheMetric.updateDisplay();
        runtime.win = new BrowserWindow({
            title: config.winTitle,
            useContentSize: true,
            width: 1200,
            height: 660,
            webPreferences: {contextIsolation: true, plugins: true},
            icon: appIcon
        }).on('page-title-updated', (evt) => {
            evt.preventDefault();
        });
        server.load().then(() => {
            console.log("start success");
            runtime.load(config.entryUrl);
        }).catch(err => {
            dialog.showErrorBox('启动失败', err.msg);
            if (err.openExternal) {
                shell.openExternal(err.openExternal).catch(a => a).then(() => {
                    runtime.exit();
                });
            } else {
                runtime.exit();
            }
        });
    })
    app.on('window-all-closed', () => {
        runtime.exit();
    });
})();

//解析文件资源路径
function appResourcesPath() {
    switch (process.platform) {
        case 'win32':
            return app.isPackaged ? path.resolve(app.getPath('exe'), '../resources') : app.getAppPath();
        case 'darwin':
            return app.isPackaged ? path.resolve(app.getPath('exe'), '../../Resources') : app.getAppPath();
    }
    throw 'unknown platform:' + process.platform;
}

//解析运行时文件资源路径
function pathResolve(p) {
    const p1 = path.join(appResourcesPath(), 'runtime', p);
    console.log("path resolve:" + p1);
    return p1;
}

//解析flash-dll
function ppapiFlashPath() {
    switch (process.platform) {
        case 'win32':
            switch (process.arch) {
                case 'ia32':
                case 'x32':
                    return pathResolve('win/pepflashplayer32_34_0_0_321.dll');
                case 'x64':
                    return pathResolve('win/pepflashplayer64_34_0_0_321.dll');
            }
            throw 'unknown arch:' + process.arch;
        case 'darwin':
            return pathResolve('mac/flash.plugin');
    }
    throw 'unknown platform:' + process.platform;
}
