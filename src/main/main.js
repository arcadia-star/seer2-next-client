const {app, BrowserWindow, Menu, dialog, session, nativeImage} = require('electron');

const fs = require("fs");
const path = require("path");

const config = require('./config');
const runtime = require('./runtime');
const server = require('./server');

const appIcon = nativeImage.createFromPath(path.resolve(__dirname, '../../build/icons/256x256.png'));

//界面程序
(() => {
    runtime.app = app;
    app.allowRendererProcessReuse = true;
    app.commandLine.appendSwitch('ppapi-flash-path', ppapiFlashPath());
    app.on('ready', function () {
        runtime.cacheMetric.updateDisplay = () => {
            let menu = [{
                label: '主菜单:)', submenu: [{
                    label: '改服主页', click() {
                        runtime.load(config.nextRootUrl);
                    }
                }, {
                    label: '刷新游戏', click() {
                        runtime.load(config.entryUrl);
                    }
                }, {
                    label: 'DevTools', click() {
                        runtime.win.webContents.openDevTools({mode: 'detach'});
                    }
                }, {
                    label: '退出', click() {
                        runtime.exit();
                    }
                }]
            }, {
                label: '2k-100%', click() {
                    runtime.win.setSize(1216, 699, true);
                }
            }, {
                label: '2k-150%', click() {
                    runtime.win.setSize(1214, 697, true);
                }
            }, {
                label: `缓存信息 hit:${runtime.cacheMetric.hit}, expire:${runtime.cacheMetric.expire}, cache:${runtime.cacheMetric.cache}`
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
        runtime.win = new BrowserWindow({
            title: config.winTitle, width: 1214, height: 697, webPreferences: {plugins: true}, icon: appIcon
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

//解析flash-dll
function ppapiFlashPath() {
    const appPath = app.getPath('exe');
    const flashPath = path.join(appPath.endsWith('electron.exe') ? app.getAppPath() : path.join(path.dirname(appPath), 'resources'), 'flash/pepflashplayer64_34_0_0_301.dll');
    console.log("flash dll:" + flashPath);
    return flashPath;
}
