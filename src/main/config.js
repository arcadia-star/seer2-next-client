const packageJson = require('../../package.json');
const path = require("path");
const {app} = require("electron");

const config = {
    serverHost: '127.0.0.1',
    serverPort: 7337,
    rootUrl: 'http://43.136.112.146/seer2',
    cacheFolder: 'Game Cache',
    magicUrlPath: '/seer2-next-client-hello?v=' + packageJson.version,
}
config.version = packageJson.version;
config.bloomUrl = config.rootUrl + '/config/bloom-path.data';
config.dynConfigUrl = config.rootUrl + '/config/dyn-client-config.xml';
config.magicUrl = 'http://' + config.serverHost + ':' + config.serverPort + config.magicUrlPath;
config.entryUrl = 'http://' + config.serverHost + ':' + config.serverPort + '/seer2/play-local.html';
config.cacheFolderRoot = path.join(app.getPath('userData'), config.cacheFolder);
config.seer2RootUrl = 'http://seer2.61.com';
config.nextRootUrl = "http://733702.xyz";
config.flashPolicyPath = '/crossdomain.xml';
config.flashPolicyData = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" /></cross-domain-policy>';
config.winTitle = '阿卡迪亚:传说 by 改服项目组 ' + 'v' + config.version;
module.exports = config;
