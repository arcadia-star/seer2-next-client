const runtime = {
    bloomContains: null,
    server: null,
    app: null,
    cacheMetric: {hit: 0, cache: 0, expire: 0, updateDisplay: () => 0}
}
runtime.exit = () => {
    process.platform !== 'darwin' && runtime.server && runtime.server.close();
    runtime.app && runtime.app.quit();
}
module.exports = runtime;