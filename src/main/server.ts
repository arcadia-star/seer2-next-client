import Koa from 'koa';
import fetch from 'node-fetch';
import {Server} from "http";
import {config} from "./config";
import {gameCachePath, runtime, version} from "./runtime";
import fs from "fs";
import path from "path";
import {md5} from "./utils";
import crypto from 'crypto';

let serverInner: Server;
const FILE_LOCK: Record<string, boolean> = {};

async function start() {
    if (serverInner) {
        return;
    }
    return new Promise((resolve) => {
        const app = new Koa();
        app.use(async ctx => {
            const urlPath = ctx.request.path;
            if (urlPath === config.magicUrlPath) {
                ctx.body = {version};
                return;
            }
            if (urlPath === config.flashPolicyPath) {
                ctx.type = 'xml';
                ctx.body = config.flashPolicyData;
                return;
            }
            if (urlPath.endsWith('/') || urlPath.endsWith('\\') || !urlPath.startsWith(config.rootUrlPath)) {
                ctx.status = 403;
                ctx.body = 'not a valid path';
                return;
            }
            if (urlPath === new URL(config.entryUrl).pathname && !ctx.request.query['version']) {
                ctx.redirect(config.entryUrlWithVersion);
                return;
            }
            const bloomPath = urlPath.slice(config.rootUrlPath.length);
            if (bloomPath === config.bloomPath) {
                ctx.status = 403;
                return;
            }
            const pathHitBloom = runtime.bloomContains && runtime.bloomContains(bloomPath);
            const filePath = path.join(gameCachePath, md5(urlPath.slice(1)) + '_' + urlPath.length);
            const stats = FILE_LOCK[bloomPath] ? null : await fs.promises.stat(filePath).catch((): null => null);
            if (stats && stats.isFile()) {
                const responseWithCache = async () => {
                    console.log('hit:' + urlPath);
                    ctx.set('x-hit', 'file');
                    ctx.lastModified = stats.mtime;
                    ctx.type = path.extname(urlPath);
                    ctx.body = await readWithDecipher(bloomPath, filePath);
                }
                //版控路径
                if (pathHitBloom) {
                    //版控符合
                    const bloomPath1 = bloomPath + '?v=' + stats.mtimeMs;
                    if (runtime.bloomContains(bloomPath1)) {
                        return responseWithCache();
                    }
                    //版控过期
                    else {
                        console.log('expire:' + urlPath);
                    }
                }
                //非版控路径
                else {
                    return responseWithCache();
                }
            }
            //尝试获取文件
            const fileUrl = (pathHitBloom ? runtime.rootUrl : config.seer2RootUrl) + bloomPath + '?' + ctx.request.querystring;
            console.log('fetch:' + fileUrl);
            const response = await fetch(fileUrl);
            const responseBuffer = await response.buffer();

            const utime = response.headers.get('last-modified');
            ctx.status = response.status;
            ctx.lastModified = utime ? new Date(utime) : new Date();
            ctx.type = path.extname(urlPath);
            ctx.set('x-hit', 'fetch');
            ctx.body = responseBuffer;

            if (ctx.status === 200 && !FILE_LOCK[bloomPath]) {
                try {
                    FILE_LOCK[bloomPath] = true;
                    writeWithDecipher(bloomPath, filePath, responseBuffer, utime);
                } finally {
                    delete FILE_LOCK[bloomPath];
                }
            }
        });
        serverInner = app.listen(config.serverPort).on('listening', () => {
            resolve(app);
        });
    })
}

function close() {
    if (!serverInner) {
        return;
    }
    serverInner.close();
    serverInner = null;
}

function writeWithDecipher(urlPath: string, filePath: string, buffer: Buffer, mtime: string | null) {
    const algorithm = 'aes-192-cbc';
    const key = crypto.scryptSync(urlPath, 'salt', 24);
    const cipher = crypto.createCipheriv(algorithm, key, Buffer.alloc(16, 0));
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    asyncCacheFile(urlPath, filePath, data, mtime).catch(console.error);
}

function readWithDecipher(urlPath: string, filePath: string): Promise<Buffer> {
    const algorithm = 'aes-192-cbc';
    const key = crypto.scryptSync(urlPath, 'salt', 24);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.alloc(16, 0));
    return new Promise((resolve, reject) => {
        const PREFIX = "read-file: ";
        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.error(PREFIX + "write file error", urlPath, err);
                reject(err);
            }
            const buffer = Buffer.concat([decipher.update(data), decipher.final()]);
            resolve(buffer);
        })
    })
}

//异步缓存文件
function asyncCacheFile(urlPath: string, filePath: string, buffer: Buffer, mtime: string | null) {
    return new Promise((resolve, reject) => {
        const PREFIX = "async-cache-file: ";
        const cacheFile = (retry: boolean) => {
            fs.writeFile(filePath, buffer, (err) => {
                if (err) {
                    if (err.code === 'ENOENT' && retry) {
                        const dir = path.dirname(filePath);
                        console.log(PREFIX + 'mkdir:' + dir);
                        fs.mkdir(dir, {recursive: true}, err => {
                            if (err) {
                                console.error(PREFIX + "mkdir error", dir, err);
                                reject(err);
                                return;
                            }
                            cacheFile(false);
                        });
                        return;
                    }
                    console.error(PREFIX + "write file error", urlPath, err);
                    reject(err);
                    return;
                }
                if (mtime) {
                    fs.utimes(filePath, new Date(), new Date(mtime), (err) => {
                        if (err) {
                            console.error(PREFIX + "file utime error", urlPath, err);
                            reject(err);
                        }
                    })
                }
                console.log(PREFIX + 'write:' + urlPath + ", mtime:" + mtime.valueOf() + ", file:" + filePath);
                resolve(null);
            });
        }
        cacheFile(true);
    });
}


export const appServer = {start, close};