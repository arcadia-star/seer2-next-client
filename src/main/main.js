const {app, BrowserWindow, Menu, dialog, session, nativeImage} = require('electron');
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
                label: ':)主菜单', submenu: [{
                    label: '★改服主页', click() {
                        runtime.load(config.nextRootUrl);
                    }
                }, {
                    label: '刷新游戏', click() {
                        runtime.load(config.entryUrl);
                    }
                }, {
                    label: '赛尔号，启动！', click() {
                        runtime.load('https://seer.61.com/play.shtml');
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
                label: ':)调整窗口',
                submenu: [
                    {
                        label: '2k-100%',
                        click() {
                            const windowSize = {width: 1216, height: 699};
                            runtime.win.setSize(windowSize.width, windowSize.height, true);
                            userData.windowSize(windowSize);
                        }
                    },
                    {
                        label: '2k-150%',
                        click() {
                            const windowSize = {width: 1214, height: 697};
                            runtime.win.setSize(windowSize.width, windowSize.height, true);
                            userData.windowSize(windowSize);
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
                label: `:)缓存信息 hit:${runtime.cacheMetric.hit}, expire:${runtime.cacheMetric.expire}, cache:${runtime.cacheMetric.cache}`
                    + `, check:${runtime.cacheMetric.check}, unchanged:${runtime.cacheMetric.unchanged}, changed:${runtime.cacheMetric.changed}`,
                submenu: [{
                    label: '清空浏览器缓存', click() {
                        session.defaultSession.clearCache();
                    }
                }, {
                    label: '清空本地缓存(一般不用点)', click() {
                        fs.rmdir(config.cacheFolderRoot, {recursive: true}, (err) => err && console.log(err));
                    }
                }]
            }]
            Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
        }
        runtime.cacheMetric.updateDisplay();
        const windowSize = userData.windowSize();
        runtime.win = new BrowserWindow({
            title: config.winTitle,
            width: windowSize.width || 1214,
            height: windowSize.height || 697,
            webPreferences: {contextIsolation: true, plugins: true},
            icon: appIcon
        }).on('page-title-updated', (evt) => {
            evt.preventDefault();
        });
        server.load().then(() => {
            console.log("start success");
            runtime.load(config.entryUrl);
        }).catch(err => {
            dialog.showErrorBox('启动失败', err);
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
            return pathResolve('win/pepflashplayer64_34_0_0_301.dll');
        case 'darwin':
            return pathResolve('mac/flash.plugin');
    }
    throw 'unknown platform:' + process.platform;
}
