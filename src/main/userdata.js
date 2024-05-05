const storage = require('electron-json-storage');

function windowSize(data) {
    if (data !== undefined) {
        storage.setSync('window-size', data);
    } else {
        return storage.getSync('window-size');
    }
}

module.exports.windowSize = windowSize;