import crypto from "crypto";
import { ProtocolRequest, ProtocolResponse } from "electron";
import fs from "fs";
import { createServer, Server } from "http";
import Koa, { Context } from "koa";
import fetch from "node-fetch";
import path from "path";
import {
    APP_GAME_CACHE_PATH,
    APP_VERSION,
    BLOOM_PATH,
    CacheMetricKey,
    FLASH_POLICY_DATA,
    FLASH_POLICY_PATH,
    LOCAL_ENTRY_URL,
    LOCAL_ENTRY_URL_WITH_VERSION,
    LOCAL_HOSTNAME,
    MAGIC_PATH,
    reportMetric,
    runtime,
    SEER2_MEE_URL,
    SEER2_PATH,
    SEER2_PORT,
} from "./runtime";
import { userData } from "./userdata";
import { md5 } from "./utils";

const server: { inner?: Server; lock?: boolean } = {};
const FILE_LOCK: Record<string, boolean> = {};

async function start() {
    if (server.inner) {
        return;
    }
    if (server.lock) {
        return Promise.reject(new Error("waiting for unlock"));
    }
    server.lock = true;
    return new Promise((resolve, reject) => {
        const serverInner = createServer(createKoaCallback());
        serverInner.on("listening", () => {
            console.log("server start success");
            server.inner = serverInner;
            server.lock = false;
            resolve(serverInner);
        });
        serverInner.on("error", (err) => {
            console.log("server start error:", err.message);
            server.lock = false;
            reject(err);
        });
        serverInner.listen(SEER2_PORT);
        console.log("server starting...");
    });
}

async function close() {
    if (!server.inner) {
        return;
    }
    if (server.lock) {
        return Promise.reject(new Error("waiting for unlock"));
    }
    server.lock = true;
    return new Promise((resolve, reject) => {
        server.inner.close((err) => {
            if (err) {
                console.log("server close error:", err.message);
                server.lock = false;
                reject(err);
                return;
            }
            console.log("server close success");
            server.inner = null;
            server.lock = false;
            resolve(null);
        });
        console.log("server closing...");
    });
}

function listening() {
    return !!server.inner;
}

function locking() {
    return !!server.lock;
}

function createKoaCallback() {
    const app = new Koa();
    app.use(serverHandler);
    return app.callback();
}

async function serverHandler(ctx: Context) {
    const urlPath = ctx.path;
    if (urlPath === MAGIC_PATH) {
        ctx.body = { version: APP_VERSION };
        return;
    }
    if (urlPath === FLASH_POLICY_PATH) {
        ctx.type = "xml";
        ctx.body = FLASH_POLICY_DATA;
        return;
    }
    if (urlPath.endsWith("/") || urlPath.endsWith("\\") || !urlPath.startsWith(SEER2_PATH)) {
        ctx.status = 403;
        ctx.body = "not a valid path";
        return;
    }
    if (urlPath === new URL(LOCAL_ENTRY_URL).pathname && !ctx.query["version"]) {
        ctx.redirect(ctx.url + new URL(LOCAL_ENTRY_URL_WITH_VERSION).search);
        return;
    }
    if (userData.proxyFileRoot) {
        const filePath = userData.proxyFileRoot + urlPath;
        if (fs.existsSync(filePath)) {
            console.info("proxy file:", urlPath);
            const buffer = await fs.promises.readFile(filePath).catch(console.error);
            if (buffer) {
                reportMetric(CacheMetricKey.Proxy);
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
    const filePath = path.join(APP_GAME_CACHE_PATH, md5(urlPath.slice(1)) + "_" + urlPath.length);
    const stats = FILE_LOCK[bloomPath] ? null : await fs.promises.stat(filePath).catch((): null => null);
    if (stats && stats.isFile()) {
        const responseWithCache = async () => {
            console.log("hit:" + urlPath);
            reportMetric(CacheMetricKey.Hit);
            ctx.set("x-hit", "file");
            ctx.lastModified = stats.mtime;
            ctx.type = path.extname(urlPath);
            ctx.body = await readWithDecipher(bloomPath, filePath);
        };
        //版控路径
        if (pathHitBloom) {
            //版控符合
            const bloomPath1 = bloomPath + "?v=" + stats.mtimeMs;
            if (runtime.bloomContains(bloomPath1)) {
                await responseWithCache();
                return;
            }
            //版控过期
            else {
                console.log("expire:" + urlPath);
                reportMetric(CacheMetricKey.Expired);
            }
        }
        //非版控路径
        else {
            await responseWithCache();
            asyncCheckCache(bloomPath, filePath, stats.mtimeMs).catch(console.error);
            return;
        }
    }
    //尝试获取文件
    const fileUrl =
        (pathHitBloom ? runtime.rootUrl : SEER2_MEE_URL) +
        bloomPath +
        (ctx.request.querystring ? "?" + ctx.request.querystring : "");
    console.log("fetch: " + fileUrl);
    reportMetric(CacheMetricKey.Fetch);
    const response = await fetch(fileUrl);
    const responseBuffer = await response.buffer();

    const utime = response.headers.get("last-modified");
    ctx.status = response.status;
    ctx.lastModified = utime ? new Date(utime) : new Date();
    ctx.type = path.extname(urlPath);
    ctx.set("x-hit", "fetch");
    ctx.body = responseBuffer;

    if (response.status === 200 && !FILE_LOCK[bloomPath]) {
        try {
            FILE_LOCK[bloomPath] = true;
            writeWithCipher(bloomPath, filePath, responseBuffer, utime).catch(console.error);
        } finally {
            delete FILE_LOCK[bloomPath];
        }
    }
}

//自定义协议
function createBufferProtocol(scheme: string) {
    const koaCallback = createKoaCallback();
    return async (request: ProtocolRequest, callback: (r: ProtocolResponse) => void) => {
        const response: ProtocolResponse = { statusCode: null, headers: {}, data: null };
        const req = {
            url: "http" + request.url.slice(scheme.length),
            method: request.method,
            headers: request.headers,
            body: request.uploadData?.[0].bytes,
        };
        if (new URL(request.url).hostname !== LOCAL_HOSTNAME) {
            await fetch(req.url, { method: req.method, headers: req.headers, body: req.body })
                .then(async (res) => {
                    callback({
                        statusCode: res.status,
                        headers: res.headers.raw(),
                        data: await res.buffer(),
                    });
                })
                .catch((err) => {
                    callback({
                        statusCode: 500,
                        data: Buffer.from("fetch error: " + err?.message),
                    });
                });
            return;
        }
        const res = {
            set statusCode(statusCode: number) {
                response.statusCode = statusCode;
            },
            hasHeader(name: string) {
                return !!response.headers[name.toLowerCase()];
            },
            setHeader(name: string, value: string | string[]) {
                response.headers[name.toLowerCase()] = value;
            },
            removeHeader(name: string) {
                response.headers[name.toLowerCase()] = null;
            },
            end(data: Buffer) {
                response.data = data;
                console.log("Protocol", `${response.statusCode} ${req.url} ${response.data.length ?? ""}`);
                callback(response);
            },
        };
        console.log("Protocol", `${req.method} ${req.url} ${req.body?.length ?? ""}`);
        koaCallback(req as never, res as never).catch();
    };
}

//写文件
async function writeWithCipher(urlPath: string, filePath: string, buffer: Buffer, mtime: string | null) {
    const algorithm = "aes-192-cbc";
    const key = crypto.scryptSync(urlPath, "salt", 24);
    const cipher = crypto.createCipheriv(algorithm, key, Buffer.alloc(16, 0));
    const data = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return asyncCacheFile(urlPath, filePath, data, mtime);
}

//读文件
async function readWithDecipher(urlPath: string, filePath: string) {
    const algorithm = "aes-192-cbc";
    const key = crypto.scryptSync(urlPath, "salt", 24);
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
        });
    });
}

//异步缓存文件
async function asyncCacheFile(urlPath: string, filePath: string, buffer: Buffer, mtime: string | null) {
    return new Promise((resolve, reject) => {
        const PREFIX = "async-cache-file: ";
        const cacheFile = (retry: boolean) => {
            fs.writeFile(filePath, buffer, (err) => {
                if (err) {
                    if (err.code === "ENOENT" && retry) {
                        const dir = path.dirname(filePath);
                        console.log(PREFIX + "mkdir:" + dir);
                        fs.mkdir(dir, { recursive: true }, (err) => {
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
                    });
                }
                console.log(PREFIX + "write:" + urlPath);
                reportMetric(CacheMetricKey.Cache);
                resolve(null);
            });
        };
        cacheFile(true);
    });
}

//异步检查缓存
async function asyncCheckCache(urlPath: string, filePath: string, mtime: number) {
    reportMetric(CacheMetricKey.Checked);
    const PREFIX = "async-check-file: ";
    const response = await fetch(SEER2_MEE_URL + urlPath, {
        headers: {
            "If-Modified-Since": new Date(mtime).toUTCString(),
        },
    });
    if (response.status === 304) {
        console.log(PREFIX + "file not change", urlPath);
        reportMetric(CacheMetricKey.Unchanged);
        return;
    }
    if (response.status !== 200) {
        console.log(PREFIX + "status not success", urlPath);
        return;
    }
    const utime = response.headers.get("last-modified");
    if (utime && new Date(utime).valueOf() === mtime) {
        console.log(PREFIX + "mtime not change", urlPath);
        reportMetric(CacheMetricKey.Unchanged);
        return;
    }
    console.log(PREFIX + "file has changed", urlPath);
    reportMetric(CacheMetricKey.Changed);
    const responseBuffer = await response.buffer();

    await writeWithCipher(urlPath, filePath, responseBuffer, utime);
}

export const appServer = { start, close, listening, locking, createBufferProtocol };
