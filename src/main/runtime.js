const runtime = {
    bloomContains: null,
    server: null,
    app: null,
    win: null,
    rootUrl: null,
    proxyFileRoot: null,
    cacheMetric: {hit: 0, cache: 0, expire: 0, check: 0, unchanged: 0, changed: 0, updateDisplay: () => 0},
    highFrequencyFileCache: {},
}

runtime.load = (url) => {
    runtime.win.loadURL(url);
}

runtime.exit = () => {
    runtime.server && runtime.server.close();
    runtime.app && runtime.app.quit();
}

runtime.constants = {
    hit: 'hit',
    cache: 'cache',
    expire: 'expire',
    check: 'check',
    unchanged: 'unchanged',
    changed: 'changed',
}

runtime.reportMetric = (type) => {
    runtime.cacheMetric[type] += 1;
    runtime.cacheMetric.updateDisplay()
}
module.exports = runtime;