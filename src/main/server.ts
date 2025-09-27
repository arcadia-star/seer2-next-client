import Koa from 'koa';
import fetch from 'node-fetch';
import {Server} from "http";
import {
    APP_GAME_CACHE_PATH,
    APP_VERSION, BLOOM_PATH,
    FLASH_POLICY_DATA,
    FLASH_POLICY_PATH,
    LOCAL_ENTRY_URL, LOCAL_ENTRY_URL_WITH_VERSION,
    MAGIC_PATH, runtime,
    SEER2_PATH,
    SEER2_PORT, SEER2_MEE_URL
} from "./runtime";
import fs from "fs";
import path from "path";
import {md5} from "./utils";
import crypto from 'crypto';
import {userData} from "./userdata";

let serverInner: Server;
const FILE_LOCK: Record<string, boolean> = {};

async function start() {
    if (serverInner) {
        return;
    }
    return new Promise((resolve, reject) => {
        const app = new Koa();
        app.use(async ctx => {
            const urlPath = ctx.request.path;
            if (urlPath === MAGIC_PATH) {
                ctx.body = {version: APP_VERSION};
                return;
            }
            if (urlPath === FLASH_POLICY_PATH) {
                ctx.type = 'xml';
                ctx.body = FLASH_POLICY_DATA;
                return;
            }
            if (urlPath.endsWith('/') || urlPath.endsWith('\\') || !urlPath.startsWith(SEER2_PATH)) {
                ctx.status = 403;
                ctx.body = 'not a valid path';
                return;
            }
            if (urlPath === new URL(LOCAL_ENTRY_URL).pathname && !ctx.request.query['version']) {
                ctx.redirect(LOCAL_ENTRY_URL_WITH_VERSION);
                return;
            }
            if (userData.proxyFileRoot) {
                const filePath = userData.proxyFileRoot + urlPath;
                if (fs.existsSync(filePath)) {
                    console.info("proxy file:", urlPath);
                    const buffer = await fs.promises.readFile(filePath).catch((): null => null);
                    if (buffer) {
                        ctx.type = path.extname(urlPath);
                        ctx.body = buffer;
                        return;
                    }
                }
            }
            const bloomPath = urlPath.slice(SEER2_PATH.length);
            if (bloomPath === BLOOM_PATH) {
                ctx.status = 403;
                return;
            }
            const pathHitBloom = runtime.bloomContains && runtime.bloomContains(bloomPath);
            const filePath = path.join(APP_GAME_CACHE_PATH, md5(urlPath.slice(1)) + '_' + urlPath.length);
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
                        await responseWithCache();
                        return;
                    }
                    //版控过期
                    else {
                        console.log('expire:' + urlPath);
                    }
                }
                //非版控路径
                else {
                    await responseWithCache();
                    asyncCheckCache(bloomPath, filePath, stats.mtimeMs);
                    return;
                }
            }
            //尝试获取文件
            const fileUrl = (pathHitBloom ? runtime.rootUrl : SEER2_MEE_URL) + bloomPath + (ctx.request.querystring ? ('?' + ctx.request.querystring) : "");
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
        const serverInner0 = app.listen(SEER2_PORT);
        serverInner0.on('listening', () => {
            serverInner = serverInner0;
            resolve(app);
        });
        serverInner0.on('error', (err) => {
            reject(err);
        });
    })
}

function listening() {
    return !!serverInner;
}

function close() {
    if (!serverInner) {
        return;
    }
    serverInner.close();
    serverInner = null;
}

async function writeWithDecipher(urlPath: string, filePath: string, buffer: Buffer, mtime: string | null) {
    const algorithm = 'aes-192-cbc';
    const key = crypto.scryptSync(urlPath, 'salt', 24);
    const cipher = crypto.createCipheriv(algorithm, key, Buffer.alloc(16, 0));
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return asyncCacheFile(urlPath, filePath, data, mtime);
}

async function readWithDecipher(urlPath: string, filePath: string) {
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
async function asyncCacheFile(urlPath: string, filePath: string, buffer: Buffer, mtime: string | null) {
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
                console.log(PREFIX + 'write:' + urlPath);
                resolve(null);
            });
        }
        cacheFile(true);
    });
}

//异步检查缓存
async function asyncCheckCache(urlPath: string, filePath: string, mtime: number) {
    const PREFIX = "async-check-file: ";
    const response = await fetch(SEER2_MEE_URL + urlPath, {
        headers: {
            'If-Modified-Since': new Date(mtime).toUTCString()
        }
    });
    if (response.status === 304) {
        console.log(PREFIX + "file not change", urlPath);
        return;
    }
    if (response.status !== 200) {
        console.log(PREFIX + "status not success", urlPath);
        return;
    }
    const utime = response.headers.get('last-modified');
    if (utime && new Date(utime).valueOf() === mtime) {
        console.log(PREFIX + "mtime not change", urlPath);
        return;
    }
    console.log(PREFIX + "file has changed", urlPath);
    const responseBuffer = await response.buffer();

    await writeWithDecipher(urlPath, filePath, responseBuffer, utime);
}

export const appServer = {start, close, listening};