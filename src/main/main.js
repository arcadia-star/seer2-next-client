//thx: https://github.com/tootyta/FlashBrowser2
const {app, BrowserWindow, Menu, dialog, session, nativeImage} = require('electron');
const fetch = require('node-fetch');

const http = require('http');
const fs = require("fs");
const path = require("path");

const config = require('./config');
const runtime = require('./runtime');
const {bloom, md5, mime} = require('./utils');

const appIcon = nativeImage.createFromPath(path.resolve(__dirname, '../../build/icons/256x256.png'));

//版控信息
(() => {
    fetch(config.bloomUrl)
        .then(e => e.text())
        .then(e => runtime.bloomContains = bloom(e))
        .catch(e => {
            console.log(e);
            dialog.showErrorBox('加载错误', '缓存版控加载失败, 降级为非版控缓存模式');
        })
})();

//本地服务器
(() => {
    runtime.server = http.createServer()
        .on('request', (req, res) => {
            if (req.url === config.magicUrlPath) {
                res.writeHead(200).end(config.magicUrlPath);
                return;
            }
            if (req.url.startsWith("http://") || req.url === config.flashPolicyPath) {
                res.writeHead(200, {
                    'Content-Type': mime('.xml'),
                    'Connection': 'Keep-Alive',
                    'Keep-Alive': 'timeout=5, max=1000'
                }).end(config.flashPolicyData);
                return;
            }
            if (req.url === config.dynConfigUrlPath) {
                fetch(config.dynConfigUrl)
                    .then(response => {
                        res.writeHead(response.status, {
                            'Content-Type': mime('.xml'),
                            'Connection': 'Keep-Alive',
                            'Keep-Alive': 'timeout=5, max=1000'
                        });
                        response.text().then(e => {
                            res.end(e.replace('bloomfilter', 'bloomfilter-ignore'));
                        })
                    });
                return;
            }
            const urlPath = new URL('http://localhost' + req.url).pathname;
            console.log('request:' + urlPath);
            if (urlPath.endsWith('/')) {
                res.writeHead(403, {
                    'Content-Type': mime('.xml'),
                    'Connection': 'Keep-Alive',
                    'Keep-Alive': 'timeout=5, max=1000'
                }).end("403");
                return;
            }
            let filePath = path.join(config.cacheFolderRoot, md5(urlPath.slice(1)));
            fs.stat(filePath, (err, stats) => {
                let notInBloom = null;
                let bloomPath = urlPath.startsWith('/seer2/') ? urlPath.slice('/seer2'.length) : urlPath;
                if (!err) {
                    let bloomPath1 = bloomPath + '?v=' + stats.mtimeMs;
                    if (!runtime.bloomContains//版控未加载
                        || (notInBloom = !runtime.bloomContains(bloomPath))//非版控路径
                        || runtime.bloomContains(bloomPath1)//版控
                    ) {
                        runtime.cacheMetric.hit += 1;
                        runtime.cacheMetric.updateDisplay();
                        console.log('hit:' + filePath);
                        let file = fs.createReadStream(filePath, {start: urlPath.length});
                        res.writeHead(200, {
                            'Content-Type': mime(urlPath),
                            'Connection': 'Keep-Alive',
                            'Keep-Alive': 'timeout=5, max=1000'
                        });
                        file.pipe(res);
                        return;
                    } else {
                        runtime.cacheMetric.expire += 1;
                        runtime.cacheMetric.updateDisplay();
                        console.log('expire:' + filePath);
                    }
                }
                const fileUrl = notInBloom === true ? (config.seer2Root + bloomPath) : (config.rootUrl + req.url);
                console.log('fetch:' + fileUrl);
                fetch(fileUrl)
                    .then(response => {
                        const headers = new fetch.Headers(response.headers);
                        let ctHeader = headers.get('Content-Type');
                        let lMHeader = headers.get('Last-Modified');
                        res.writeHead(response.status, {
                            'Content-Type': ctHeader,
                            'Last-Modified': lMHeader || new Date().toUTCString(),
                            'Connection': 'Keep-Alive',
                            'Keep-Alive': 'timeout=5, max=1000'
                        });
                        response.buffer().then(e => {
                            const cacheFile = (needRetry) => {
                                fs.writeFile(filePath, Buffer.concat([new Uint8Array(urlPath.length), e]), (err) => {
                                    if (err && err.code === 'ENOENT') {
                                        if (needRetry) {
                                            let dir = path.dirname(filePath);
                                            console.log('mkdir:' + dir);
                                            fs.mkdirSync(dir, {recursive: true})
                                            cacheFile(false);
                                            return;
                                        }
                                    }
                                    let mtime = lMHeader ? new Date(lMHeader) : new Date();
                                    fs.utimes(filePath, new Date, mtime, (err) => err && console.log(err));
                                    console.log('write:' + filePath + ", mtime:" + mtime.valueOf() + (err ? (", err:" + err) : ''));
                                    runtime.cacheMetric.cache += 1;
                                    runtime.cacheMetric.updateDisplay();
                                })
                            }
                            cacheFile(true);
                            res.end(e);
                        });
                    })
            });
        })
        .on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                fetch(config.magicUrl)
                    .then(e => e.text())
                    .then(e => {
                        if (e !== config.magicUrlPath) {
                            dialog.showErrorBox('启动错误', '本地服务器端口被占用');
                        }
                    })
                    .catch(err => {
                        console.log(err);
                        dialog.showErrorBox('启动错误', '本地服务器启动异常');
                    })
            } else {
                console.log(err);
                dialog.showErrorBox('启动错误', '本地服务器启动失败');
            }
        })
        .listen(config.serverPort, config.serverHost);
})();

//界面程序
(() => {
    runtime.app = app;
    app.commandLine.appendSwitch('ppapi-flash-path', ppapiFlashPath());
    app.on('ready', function () {
        runtime.cacheMetric.updateDisplay = () => {
            let menu = [{
                label: '主菜单:)', submenu: [{
                    label: '改服主页', click() {
                        win.loadURL("http://733702.xyz");
                    }
                }, {
                    label: '刷新游戏', click() {
                        win.loadURL(config.entryUrl).then(() => {
                            win.setTitle(title);
                        });
                    }
                }, {
                    label: 'DevTools', click() {
                        win.webContents.openDevTools({mode: 'detach'});
                    }
                }, {
                    label: '退出', click() {
                        runtime.exit();
                    }
                }]
            }, {
                label: '2k-100%', click() {
                    win.setSize(1216, 699, true);
                }
            }, {
                label: '2k-150%', click() {
                    win.setSize(1214, 697, true);
                }
            }, {
                label: `缓存信息 hit:${runtime.cacheMetric.hit}, expire:${runtime.cacheMetric.expire}, cache:${runtime.cacheMetric.cache}`,
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
        let title = '阿卡迪亚:传说 by 改服项目组  ' + 'v' + config.version;
        let win = new BrowserWindow({
            title,
            width: 1214,
            height: 697,
            webPreferences: {
                plugins: true
            },
            icon: appIcon
        })
        win.loadURL(config.entryUrl).then(() => {
            win.setTitle(title);
        });
    })
    app.on('window-all-closed', () => {
        runtime.exit();
    })
})();

//解析flash-dll
function ppapiFlashPath() {
    const appPath = app.getPath('exe');
    const flashPath = path.join(
        appPath.endsWith('electron.exe')
            ? app.getAppPath()
            : path.join(path.dirname(appPath), 'resources')
        , 'flash/pepflashplayer64_34_0_0_301.dll');
    console.log("flash dll:" + flashPath);
    return flashPath;
}