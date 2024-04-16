const crypto = require("crypto");

function mime(filePath) {
    if (filePath.endsWith('.html')) {
        return 'text/html'
    }
    if (filePath.endsWith('.js')) {
        return 'application/javascript';
    }
    if (filePath.endsWith('.swf')) {
        return 'application/x-shockwave-flash';
    }
    if (filePath.endsWith('.xml')) {
        return 'text/xml';
    }
    return 'application/octet-stream';
}

function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

function bloom(data) {
    const split = data.split("\n");
    const func_num = parseInt(split[1]);
    const buffer = Buffer.from(split[2], 'base64');
    const bloom = [];
    for (let i = 0; i < buffer.length; i++) {
        let num = buffer[i];
        for (let j = 0; j < 8; j++) {
            bloom.push((num >> j & 1) === 1);
        }
    }
    return function (data) {
        const hash = md5(data);
        const hash1 = BigInt(parseInt(hash.substr(0, 8), 16) ^ parseInt(hash.substr(8, 8), 16));
        const hash2 = BigInt(parseInt(hash.substr(16, 8), 16) ^ parseInt(hash.substr(24, 8), 16));
        let combinedHash = hash1;
        for (let i = 0; i < func_num; i++) {
            //js feature :(
            combinedHash &= BigInt(0xFFFFFFFF);
            if (!bloom[combinedHash % BigInt(bloom.length)]) {
                return false;
            }
            combinedHash += hash2;
        }
        return true;
    };
}

module.exports = {mime, md5, bloom}
