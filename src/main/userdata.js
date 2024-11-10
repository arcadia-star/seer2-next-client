const storage = require('electron-json-storage');

const DATA_KEY = "userConfig";
const userData = {
    load() {
        let data = storage.getSync(DATA_KEY) || {};
        this.proxyFileRoot = data.proxyFileRoot;
        this.ppapiFlash = data.ppapiFlash;
    },
    save() {
        storage.setSync(DATA_KEY, {
            proxyFileRoot: this.proxyFileRoot,
            ppapiFlash: this.ppapiFlash,
        });
    }
};
module.exports = userData;
