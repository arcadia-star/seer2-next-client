import {app, nativeImage} from "electron";
import path from "path";
import {userData} from "./userdata";
import fs from "fs";

export const DNS_ROOT = "next-client-root.733702.xyz"
export const SEER2_PATH = "/seer2"
export const SEER2_PORT = 7337;
export const SEER2_MEE_URL = "http://seer2.61.com";

export const FLASH_POLICY_PATH = "/crossdomain.xml"
export const FLASH_POLICY_DATA = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" /></cross-domain-policy>';

export const MAGIC_PATH = "/seer2-next-client-hello"
export const BLOOM_PATH = "/config/bloom-path.data"
export const LOCAL_PROTOCOL = "http";
export const LOCAL_HOSTNAME = "seer2.next";
export const LOCAL_MAGIC_URL = `${LOCAL_PROTOCOL}://${LOCAL_HOSTNAME}:${SEER2_PORT}${MAGIC_PATH}`;
export const LOCAL_ENTRY_URL = `${LOCAL_PROTOCOL}://${LOCAL_HOSTNAME}:${SEER2_PORT}${SEER2_PATH}/play-local.html`;
export const LOCAL_ENTRY_URL_WITH_VERSION = `${LOCAL_ENTRY_URL}?version=${app.getVersion()}&platform=${process.platform}&arch=${process.arch}`;

export const APP_VERSION = app.getVersion();
export const APP_RESOURCES_PATH = resourcesPath();
export const APP_RUNTIME_PATH = path.resolve(APP_RESOURCES_PATH, "runtime");
export const APP_GAME_CACHE_PATH = path.join(app.getPath('userData'), 'Game Cache V2');

export const PPAPI_FLASH_FOLDER = `${APP_RUNTIME_PATH}/${process.platform}/${process.arch}`;
export const PPAPI_FLASH_DLLS = ppapiFlashDlls();
export const PPAPI_FLASH_PATH = ppapiFlashPath();

export const WINDOW_ICON = nativeImage.createFromPath(`${APP_RUNTIME_PATH}/icons/256x256.png`);
export const WINDOW_TITLE = `阿卡迪亚:传说 by 改服项目组 v${APP_VERSION} ${process.platform}-${process.arch}`;

function resourcesPath() {
    switch (process.platform) {
        case 'win32':
            return app.isPackaged ? path.resolve(app.getPath('exe'), '../resources') : app.getAppPath();
    }
    throw 'unknown platform:' + process.platform;
}

function ppapiFlashDlls() {
    return fs.readdirSync(PPAPI_FLASH_FOLDER).filter(e => e.endsWith(".dll"));
}

function ppapiFlashPath() {
    if (!PPAPI_FLASH_DLLS.length) {
        throw "flash dll not found";
    }
    const {ppapiFlash} = userData;
    const dll = PPAPI_FLASH_DLLS.find(e => e === ppapiFlash) || (userData.ppapiFlash = PPAPI_FLASH_DLLS[0]);
    return `${PPAPI_FLASH_FOLDER}/${dll}`;
}

console.log('Node.js version:', process.version);
console.log('Electron version:', process.versions.electron);
console.log('Chrome version:', process.versions.chrome);
console.log('appResourcesPath:', APP_RESOURCES_PATH);
console.log('ppapiFlashPath:', PPAPI_FLASH_PATH);
console.log('gameCachePath:', APP_GAME_CACHE_PATH);

export type AppRuntime = {
    rootUrl?: string,
    bloomContains?: (path: string) => boolean;
}

export const runtime: AppRuntime = {};

export enum CacheMetricKey {
    Hit,
    Cache,
    Expired,
    Checked,
    Unchanged,
    Changed,
    Proxy,
}

export const cacheMetric: {
    callback?: () => void,
    data: Record<CacheMetricKey, number>,
} = {
    data: {
        [CacheMetricKey.Hit]: 0,
        [CacheMetricKey.Cache]: 0,
        [CacheMetricKey.Expired]: 0,
        [CacheMetricKey.Checked]: 0,
        [CacheMetricKey.Unchanged]: 0,
        [CacheMetricKey.Changed]: 0,
        [CacheMetricKey.Proxy]: 0
    }
};

export function reportMetric(key: CacheMetricKey) {
    cacheMetric.data[key] += 1;
    cacheMetric?.callback?.();
}

export function queryMetric(key: CacheMetricKey) {
    return cacheMetric.data[key];
}