const packageJson = require('../../package.json');
const path = require("path");
const {app} = require("electron");

const config = {
    rootUrlHost: 'next-client-root.733702.xyz',
    rootUrlPath: '/seer2',
    serverHost: '127.0.0.1',
    serverPort: 7337,
    cacheFolder: 'Game Cache',
    magicUrlPath: '/seer2-next-client-hello?v=' + packageJson.version,
}
config.version = packageJson.version;
config.bloomPath = '/config/bloom-path.data';
config.dynConfigPath = '/config/dyn-client-config.xml';
config.magicUrl = 'http://' + config.serverHost + ':' + config.serverPort + config.magicUrlPath;
config.entryUrl = 'http://' + config.serverHost + ':' + config.serverPort + config.rootUrlPath + '/play-local.html';
config.cacheFolderRoot = path.join(app.getPath('userData'), config.cacheFolder);
config.seer2RootUrl = 'http://seer2.61.com';
config.nextRootUrl = "http://733702.xyz";
config.flashPolicyPath = '/crossdomain.xml';
config.flashPolicyData = '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" /></cross-domain-policy>';
config.winTitle = '阿卡迪亚:传说 by 改服项目组 ' + 'v' + config.version;
config.highFrequencyFile = [
    '/res/loaderLibrary/rightToolbar/1.swf',
    '/res/loaderLibrary/rightToolbar/2.swf',
    '/res/loaderLibrary/rightToolbar/5.swf',
    '/res/loaderLibrary/rightToolbar/8.swf',
    '/res/loaderLibrary/rightToolbar/14.swf',
    '/res/loaderLibrary/rightToolbar/15.swf',
    '/res/loaderLibrary/rightToolbar/25.swf',
    '/res/loaderLibrary/rightToolbar/30.swf',
    '/res/loaderLibrary/rightToolbar/41.swf',
    '/res/loaderLibrary/rightToolbar/50.swf',
    '/res/loaderLibrary/rightToolbar/66.swf',
    '/res/loaderLibrary/rightToolbar/77.swf',
    '/config/binaryData/2_com.taomee.seer2.app.config.ItemConfig__itemXmlClass.xml',
    '/config/binaryData/3_com.taomee.seer2.app.arena.util.HitInfoConfig__hitData.xml',
    '/config/binaryData/7_com.taomee.seer2.app.config.SkillSideEffectConfig__buffXmlClass.xml',
    '/config/binaryData/15_com.taomee.seer2.app.config.SkillConfig__movesXmlClass.xml',
    '/config/binaryData/21_com.taomee.seer2.app.config.NonoActivityConfig__xmlClass.xml',
    '/config/binaryData/23_com.taomee.seer2.app.config.SkillConfig__hideMovesXmlClass.xml',
    '/config/binaryData/29_com.taomee.seer2.app.config.ActCalendarConfig__xml.xml',
    '/config/binaryData/44_com.taomee.seer2.app.config.ShopPanelConfig__class.xml',
    '/config/binaryData/45_com.taomee.seer2.app.config.PetConfig__dictionaryXmlClass.xml',
    '/config/binaryData/59_com.taomee.seer2.app.rightToolbar.config.RightToolbarConfig__xmlClass.xml',
    '/config/binaryData/64_com.taomee.seer2.app.config.PetConfig__petXmlClass.xml',
    '/res/ui/UI.swf',
    '/dll/Assets.swf',
    '/dll/LoginModule.swf',
    '/dll/Seer2CoreDLL.swf',
];

module.exports = config;
