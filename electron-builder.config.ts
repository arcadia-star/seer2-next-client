// electron-builder.config.ts
import { Configuration } from "electron-builder";

const config: Configuration = {
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    files: [
        "out",
        // 排除输出目录自身，防止嵌套打包
        "!dist/**",
        "!dist-*/**",
    ],
    win: {
        target: [
            {
                target: "nsis",
                arch: ["x64", "ia32"],
            },
        ],
        // 将 speedhook DLL 和 speed-overlay.html 打入 resources/
        extraResources: [
            "runtime/icons",
            "runtime/win32",
            {
                // DLL 按当前构建架构选择性打包
                // electron-builder 会为每种 arch 各打一次，此处打入全部，
                // 运行时 speed.ts 按 process.arch 动态选择
                from: "speedhook",
                to: "speedhook",
            },
            {
                // 变速面板 HTML（loadFile 直接引用）
                from: "resources",
                to: ".",
                filter: ["speed-overlay.html"],
            },
        ],
        requestedExecutionLevel: "asInvoker",
    },
    nsis: {
        oneClick: false,
        perMachine: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true,
    },
    publish: [
        {
            provider: "github",
            owner: "arcadia-star",
            repo: "seer2-next-client-release",
        },
    ],
};

export default config;
