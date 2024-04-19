const runtime = {
    bloomContains: null,
    server: null,
    app: null,
    win: null,
    cacheMetric: {hit: 0, cache: 0, expire: 0, updateDisplay: () => 0},
}
runtime.exit = () => {
    process.platform !== 'darwin' && runtime.server && runtime.server.close();
    runtime.app && runtime.app.quit();
}
runtime.constants = {
    hit: 'hit',
    cache: 'cache',
    expire: 'expire',
}
runtime.reportMetric = (type) => {
    runtime.cacheMetric[type] += 1;
    runtime.cacheMetric.updateDisplay()
}
module.exports = runtime;