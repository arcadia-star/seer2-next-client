import {app} from "electron";

export const config = {
    rootUrlHost: 'next-client-root.733702.xyz',
    rootUrlPath: '/seer2',
    serverHost: '127.0.0.1',
    serverPort: 7337,
    magicUrlPath: '/seer2-next-client-hello',
    bloomPath: '/config/bloom-path.data',
    flashPolicyPath: '/crossdomain.xml',
    flashPolicyData: '<?xml version="1.0"?><!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd"><cross-domain-policy><allow-access-from domain="*" /></cross-domain-policy>',
    seer2RootUrl: 'http://seer2.61.com',
    nextRootUrl: "http://733702.xyz",
    magicUrl: '',
    entryUrl: '',
    entryUrlWithVersion: '',
}
config.magicUrl = `http://${config.serverHost}:${config.serverPort}${config.magicUrlPath}`;
config.entryUrl = `http://${config.serverHost}:${config.serverPort}${config.rootUrlPath}/play-local.html`;
config.entryUrlWithVersion = `${config.entryUrl}?version=${app.getVersion()}&platform=${process.platform}&arch=${process.arch}`;
