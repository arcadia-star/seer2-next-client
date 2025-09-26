import crypto from 'crypto';

export function md5(data: string) {
    return crypto.createHash('md5').update(data).digest('hex');
}

export function bloom(data: string) {
    const split = data.split("\n");
    const func_num = parseInt(split[1]);
    const buffer = Buffer.from(split[2], 'base64');
    const bloom: boolean[] = [];
    for (let i = 0; i < buffer.length; i++) {
        const num = buffer[i];
        for (let j = 0; j < 8; j++) {
            bloom.push((num >> j & 1) === 1);
        }
    }
    return function (data: string) {
        const hash = md5(data);
        const hash1 = BigInt(parseInt(hash.slice(0, 8), 16) ^ parseInt(hash.slice(8, 16), 16));
        const hash2 = BigInt(parseInt(hash.slice(16, 24), 16) ^ parseInt(hash.slice(24, 32), 16));
        let combinedHash = hash1;
        for (let i = 0; i < func_num; i++) {
            //js feature :(
            combinedHash &= BigInt(0xFFFFFFFF);
            if (!bloom[Number(combinedHash % BigInt(bloom.length))]) {
                return false;
            }
            combinedHash += hash2;
        }
        return true;
    };
}
