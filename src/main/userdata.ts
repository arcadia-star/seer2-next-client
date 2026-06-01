import storage from "electron-json-storage";

export const USER_DATA_CONFIG_KEY = "userConfig2";

export type UserData = {
    proxyFileRoot?: string;
    ppapiFlash?: string;
    alwaysOnTop?: boolean;
};

function readSync(): UserData {
    const data = storage.getSync(USER_DATA_CONFIG_KEY);
    console.log("userData read:", data);
    return data;
}

function write(data: UserData): Promise<UserData> {
    console.log("userData write:", data);
    return new Promise((resolve, reject) => {
        storage.set(USER_DATA_CONFIG_KEY, data, (error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(data);
        });
    });
}

export const userData = readSync();

export function modifyUserData(modify: (userData: UserData) => any) {
    modify(userData);
    return write(userData);
}
