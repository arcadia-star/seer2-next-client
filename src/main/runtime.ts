import {app, nativeImage} from "electron";
import path from "path";

export const version = app.getVersion();
export const appResourcesPath = (function () {
    switch (process.platform) {
        case 'win32':
            return app.isPackaged ? path.resolve(app.getPath('exe'), '../resources') : app.getAppPath();
    }
    throw 'unknown platform:' + process.platform;
})();
export const runtimePath = path.resolve(appResourcesPath, "runtime");
export const ppapiFlashPath = `${runtimePath}/${process.platform}/${process.arch}/pepflashplayer64_34_0_0_308.dll`;
export const gameCachePath = path.join(app.getPath('userData'), 'Game Cache V2');

export const appIcon = nativeImage.createFromPath(`${runtimePath}/icons/256x256.png`);
export const windowTitle = `阿卡迪亚:传说 by 改服项目组 v${version} ${process.platform}-${process.arch}`;

console.log('Node.js version:', process.version);
console.log('Electron version:', process.versions.electron);
console.log('Chrome version:', process.versions.chrome);
console.log('appResourcesPath:', appResourcesPath);
console.log('ppapiFlashPath:', ppapiFlashPath);
console.log('gameCachePath:', gameCachePath);

export const runtime: {
    rootUrl?: string,
    bloomContains?: (s: string) => boolean,
} = {};