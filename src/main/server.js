const http = require('http');
const fs = require("fs");
const path = require("path");
const dns = require('dns');

const config = require('./config');
const runtime = require('./runtime');
const {bloom, md5, mime} = require('./utils');
const fetch = require("node-fetch");

async function load() {
    //dns
    runtime.rootUrl = await dnsLookup(config.rootUrlHost)
        .then(address => `http://${address}${config.rootUrlPath}`)
        .catch(() => Promise.reject('dns解析失败'));

    //版控
    runtime.bloomContains = await fetch(runtime.rootUrl + config.bloomPath)
        .then(e => e.text())
        .then(e => bloom(e))
        .catch(() => Promise.reject('版控文件加载失败'));

    //强版控
    if (!runtime.bloomContains('/version/seer2-next-client/v' + config.version)) {
        return Promise.reject('当前版本已被禁用, 建议下载最新版本');
    }

    //server
    runtime.server = await createServer();

    //高频文件缓存
    cacheHighFrequencyFile();
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
            console.log(PREFIX + 'write:' + urlPath + ", mtime:" + mtime.valueOf() + ", file:" + filePath);
            runtime.reportMetric(runtime.constants.cache);
        })
    }
    cacheFile(true);
}

//异步检查缓存
function asyncCheckCache(urlPath, seer2Path, filePath, mtime) {
    const PREFIX = "async-check-file: ";
    runtime.reportMetric(runtime.constants.check);
    fetch(config.seer2RootUrl + seer2Path, {
        headers: {
            'If-Modified-Since': mtime.toUTCString()
        }
    }).then(response => {
        if (response.status === 304) {
            console.log(PREFIX + "file not change", urlPath);
            runtime.reportMetric(runtime.constants.unchanged);
            return;
        }
        if (response.status !== 200) {
            console.log(PREFIX + "status not success", urlPath);
            return;
        }
        const lastModified = new Date(response.headers.get('Last-Modified') || Date.now());
        if (lastModified.valueOf() === mtime.valueOf()) {
            console.log(PREFIX + "mtime not change", urlPath);
            runtime.reportMetric(runtime.constants.unchanged);
            return;
        }
        console.log(PREFIX + "file has changed", urlPath);
        runtime.reportMetric(runtime.constants.changed);
        response.buffer().then(buffer => {
            asyncCacheFile(Buffer.concat([new Uint8Array(urlPath.length), buffer]), filePath, buffer, lastModified);
        });
    })
}

//高频文件缓存
function cacheHighFrequencyFile() {
    for (let bloomPath of config.highFrequencyFile) {
        const urlPath = config.rootUrlPath + bloomPath;
        const filePath = path.join(config.cacheFolderRoot, md5(urlPath.slice(1)) + '_' + urlPath.length);
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return;
            }
            const bloomPath1 = bloomPath + '?v=' + stats.mtimeMs;
            if (runtime.bloomContains
                && runtime.bloomContains(bloomPath)
                && runtime.bloomContains(bloomPath1)
            ) {
                fs.readFile(filePath, (err1, data) => {
                    if (err1) {
                        return;
                    }
                    console.log('pre-cache:' + urlPath);
                    runtime.highFrequencyFileCache[urlPath] = data.slice(urlPath.length);
                })
            }
        })
    }
}

//dns 解析
async function dnsLookup(host) {
    return new Promise((resolve, reject) => {
        dns.lookup(host, {}, (err, address) => {
            console.log('dns lookup: %s %j', host, address);
            if (err) {
                resolve(err);
            } else {
                resolve(address);
            }
        });
    })
}

async function createServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer()
            .on('request', (req, res) => {
                if (req.url === config.magicUrlPath) {
                    res.writeHead(200).end({version: config.version});
                    return;
                }
                if (req.url === config.flashPolicyPath) {
                    res.writeHead(200, {
                        'Content-Type': mime('.xml'), 'Connection': 'Keep-Alive', 'Keep-Alive': 'timeout=5, max=1000'
                    }).end(config.flashPolicyData);
                    return;
                }
                if (req.url.endsWith('/') || req.url.endsWith('\\') || !req.url.startsWith(config.rootUrlPath)) {
                    res.writeHead(403).end('not a valid path');
                    return;
                }
                const urlPath = new URL('http://localhost' + req.url).pathname;
                console.log('request:' + urlPath);
                if (req.url === new URL(config.entryUrl).pathname) {
                    res.writeHead(302, {location: config.entryUrlWithVersion}).end(config.entryUrlWithVersion);
                    return;
                }
                if (req.url === config.dynConfigPath) {
                    fetch(runtime.rootUrl + config.dynConfigPath)
                        .then(response => {
                            res.writeHead(response.status, {
                                'Content-Type': mime('.xml'),
                                'Connection': 'Keep-Alive',
                                'Keep-Alive': 'timeout=5, max=1000'
                            });
                            response.text().then(e => {
                                res.end(e.replace('//seer2.61.com', config.rootUrlPath));
                            })
                        });
                    return;
                }
                if (req.url === config.bloomPath) {
                    fetch(runtime.rootUrl + config.bloomPath)
                        .then(response => {
                            res.writeHead(response.status, {
                                'Connection': 'Keep-Alive',
                                'Keep-Alive': 'timeout=5, max=1000'
                            });
                            response.buffer().then(buffer => {
                                res.end(buffer);
                            })
                        });
                    return;
                }

                //高频文件缓存
                const hfCache = runtime.highFrequencyFileCache[urlPath];
                if (hfCache) {
                    runtime.reportMetric(runtime.constants.hit);
                    console.log('hfCache-hit:' + urlPath);
                    res.writeHead(200, {
                        'Content-Type': mime(urlPath),
                        'Connection': 'Keep-Alive',
                        'Keep-Alive': 'timeout=5, max=1000'
                    }).end(hfCache);
                    return;
                }
                //本地文件缓存
                const filePath = path.join(config.cacheFolderRoot, md5(urlPath.slice(1)) + '_' + urlPath.length);
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
                    const bloomPath = urlPath.slice(config.rootUrlPath.length);
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
                    const fileUrl = (pathHitBloom ? runtime.rootUrl : config.seer2RootUrl) + bloomPath;
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
            .on('listening', () => {
                resolve(server);
            })
            .on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    fetch(config.magicUrl)
                        .then(e => e.json())
                        .then(e => {
                            if (e.version !== config.version) {
                                reject('本地服务器端口被占用');
                            }
                        })
                        .catch(err => {
                            console.log(err);
                            reject('本地服务器启动异常');
                        })
                } else {
                    console.log(err);
                    reject('本地服务器启动失败');
                }
            })
            .listen(config.serverPort, config.serverHost);
    });
}

module.exports.load = load;