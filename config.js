const packageJson = require('./package.json');
const path = require("path");
const {app} = require("electron");

const config = {
    serverHost: '127.0.0.1',
    serverPort: 7337,
    rootUrl: 'http://43.136.112.146',
    cacheFolder: 'Game Cache',
    dynConfigUrlPath: '/seer2/config/dyn-client-config.xml',
    bloomUrlPath: '/seer2/config/bloom-path.data',
    magicUrlPath: '/seer2-next-client-hello?v=' + packageJson.version,
}
config.bloomUrl = config.rootUrl + config.bloomUrlPath;
config.dynConfigUrl = config.rootUrl + config.dynConfigUrlPath;
config.magicUrl = 'http://' + config.serverHost + ':' + config.serverPort + config.magicUrlPath;
config.entryUrl = 'http://' + config.serverHost + ':' + config.serverPort + '/seer2/play.html';
config.cacheFolderRoot = path.join(app.getPath('userData'), config.cacheFolder);
module.exports = config;
