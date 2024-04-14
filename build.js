const fs = require('fs');
const path = require('path');
fs.mkdirSync(path.resolve(__dirname, 'dist/win-unpacked/flash/'), {recursive: true});
fs.copyFileSync(
    path.resolve(__dirname, 'flash/pepflashplayer64_34_0_0_301.dll'),
    path.resolve(__dirname, 'dist/win-unpacked/flash/pepflashplayer64_34_0_0_301.dll')
)