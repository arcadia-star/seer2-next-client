//thx: https://github.com/tootyta/FlashBrowser2
const {app, BrowserWindow, Menu, dialog, session, nativeImage} = require('electron');
const {autoUpdater} = require("electron-updater");
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
        .then(e => {
            if (!runtime.bloomContains('/version/seer2-next-client/v' + config.version)) {
                dialog.showErrorBox('版本错误', '当前版本已被禁用, 建议下载最新版本');
                app.exit();
            } else {
                runtime.win.loadURL(config.entryUrl).then(() => {
                    runtime.win.setTitle(config.winTitle);
                });
            }
        })
        .catch(e => {
            console.log(e);
            dialog.showErrorBox('加载错误', '版控配置加载失败, 降级为改服主页');
            runtime.win.loadURL(config.nextRootUrl).then(() => {
                runtime.win.setTitle(config.winTitle);
            });
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
                    'Content-Type': mime('.xml'), 'Connection': 'Keep-Alive', 'Keep-Alive': 'timeout=5, max=1000'
                }).end(config.flashPolicyData);
                return;
            }
            if (req.url === new URL(config.dynConfigUrl).pathname) {
                fetch(config.dynConfigUrl)
                    .then(response => {
                        res.writeHead(response.status, {
                            'Content-Type': mime('.xml'),
                            'Connection': 'Keep-Alive',
                            'Keep-Alive': 'timeout=5, max=1000'
                        });
                        response.text().then(e => {
                            res.end(e.replace('//seer2.61.com/', '/seer2/'));
                        })
                    });
                return;
            }
            if (req.url.endsWith('/') || req.url.endsWith('\\') || !req.url.startsWith('/seer2/')) {
                res.writeHead(403).end('not a valid path');
                return;
            }
            const urlPath = new URL('http://localhost' + req.url).pathname;
            console.log('request:' + urlPath);
            const filePath = path.join(config.cacheFolderRoot, md5(urlPath.slice(1)));
            fs.stat(filePath, (err, stats) => {
                //非文件不存在
                if (err && err.code !== 'ENOENT') {
                    console.error("file stat error:", err);
                    res.writeHead(403).end("not readable");
                    return;
                }
                //非文件类型
                if (stats && !stats.isFile()) {
                    res.writeHead(403).end("not file");
                    return;
                }
                const bloomPath = urlPath.slice('/seer2'.length);
                const pathHitBloom = runtime.bloomContains && runtime.bloomContains(bloomPath);
                //文件存在
                if (stats) {
                    const responseWithCache = () => {
                        runtime.reportMetric(runtime.constants.hit);
                        console.log('hit:' + urlPath);
                        let file = fs.createReadStream(filePath, {start: urlPath.length});
                        res.writeHead(200, {
                            'Content-Type': mime(urlPath),
                            'Connection': 'Keep-Alive',
                            'Keep-Alive': 'timeout=5, max=1000'
                        });
                        file.pipe(res);
                    }
                    //版控路径
                    if (pathHitBloom) {
                        //版控符合
                        const bloomPath1 = bloomPath + '?v=' + stats.mtimeMs;
                        if (runtime.bloomContains(bloomPath1)) {
                            responseWithCache();
                            return;
                        }
                        //版控过期
                        else {
                            runtime.reportMetric(runtime.constants.expire)
                            console.log('expire:' + urlPath);
                        }
                    }
                    //非版控路径
                    else {
                        responseWithCache();
                        asyncCheckCache(urlPath, bloomPath, filePath, new Date(stats.mtimeMs));
                        return;
                    }
                }
                //尝试获取文件
                const fileUrl = (pathHitBloom ? config.rootUrl : config.seer2RootUrl) + bloomPath;
                console.log('fetch:' + fileUrl);
                fetch(fileUrl).then(response => {
                    const headers = new fetch.Headers(response.headers);
                    let ctHeader = headers.get('Content-Type');
                    const lastModified = new Date(response.headers.get('Last-Modified') || Date.now());
                    res.writeHead(response.status, {
                        'Content-Type': ctHeader,
                        'Last-Modified': lastModified.toUTCString(),
                        'Connection': 'Keep-Alive',
                        'Keep-Alive': 'timeout=5, max=1000'
                    });
                    response.buffer().then(buffer => {
                        if (response.status === 200) {
                            asyncCacheFile(urlPath, filePath, buffer, lastModified)
                        } else {
                            console.log("status not success", fileUrl);
                        }
                        res.end(buffer);
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
                        runtime.win.loadURL(config.nextRootUrl).then(() => {
                            runtime.win.setTitle(config.winTitle);
                        });
                    }
                }, {
                    label: '刷新游戏', click() {
                        runtime.win.loadURL(config.entryUrl).then(() => {
                            runtime.win.setTitle(config.winTitle);
                        });
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
        runtime.win = new BrowserWindow({
            title: config.winTitle, width: 1214, height: 697, webPreferences: {plugins: true}, icon: appIcon
        });
    })
    app.on('window-all-closed', () => {
        runtime.exit();
    })
})();

//解析flash-dll
function ppapiFlashPath() {
    const appPath = app.getPath('exe');
    const flashPath = path.join(appPath.endsWith('electron.exe') ? app.getAppPath() : path.join(path.dirname(appPath), 'resources'), 'flash/pepflashplayer64_34_0_0_301.dll');
    console.log("flash dll:" + flashPath);
    return flashPath;
}

//异步缓存文件
function asyncCacheFile(urlPath, filePath, buffer, mtime) {
    const PREFIX = "async-cache-file: ";
    const cacheFile = (needRetry) => {
        fs.writeFile(filePath, Buffer.concat([new Uint8Array(urlPath.length), buffer]), (err) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    if (needRetry) {
                        let dir = path.dirname(filePath);
                        console.log(PREFIX + 'mkdir:' + dir);
                        fs.mkdir(dir, {recursive: true}, err => {
                            if (err) {
                                console.error(PREFIX + "mkdir error", dir, err);
                                return;
                            }
                            cacheFile(false);
                        });
                        return;
                    }
                }
                console.error(PREFIX + "write file error", urlPath, err);
                return;
            }
            fs.utimes(filePath, new Date(), mtime, (err) => {
                if (err) {
                    console.error(PREFIX + "file utime error", urlPath, err);
                }
            });
            console.log(PREFIX + 'write:' + urlPath + ", mtime:" + mtime.valueOf());
            runtime.reportMetric(runtime.constants.cache);
        })
    }
    cacheFile(true);
}

//异步检查缓存
function asyncCheckCache(urlPath, seer2Path, filePath, mtime) {
    const PREFIX = "async-check-file: ";
    fetch(config.seer2RootUrl + seer2Path, {
        headers: {
            'If-Modified-Since': mtime.toUTCString()
        }
    }).then(response => {
        if (response.status === 304) {
            console.log(PREFIX + "file not change", urlPath);
            return;
        }
        if (response.status !== 200) {
            console.log(PREFIX + "status not success", urlPath);
            return;
        }
        const lastModified = new Date(response.headers.get('Last-Modified') || Date.now());
        if (lastModified.valueOf() === mtime.valueOf()) {
            console.log(PREFIX + "mtime not change", urlPath);
            return;
        }
        console.log(PREFIX + "file has changed", urlPath);
        response.buffer().then(buffer => {
            asyncCacheFile(Buffer.concat([new Uint8Array(urlPath.length), buffer]), filePath, buffer, lastModified);
        });
    })
}
