// electron-builder.config.ts
import { Configuration } from "electron-builder";

const config: Configuration = {
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    files: [
        "out"
    ],
    win: {
        target: [
            {
                target: "nsis",
                arch: [
                    "x64",
                    "ia32"
                ]
            }
        ],
        extraResources: [
            "runtime/icons",
            "runtime/win32"
        ]
    },
    nsis: {
        oneClick: false,
        perMachine: false,
        allowElevation: true,
        allowToChangeInstallationDirectory: true
    },
    mac: {
        target: [
            {
                target: "dmg",
                arch: [
                    "x64",
                    "arm64"
                ]
            }
        ],
        extraResources: [
            "runtime/icons",
            "runtime/darwin"
        ]

    },
    publish: [
        {
            provider: "github",
            owner: "arcadia-star",
            repo: "seer2-next-client-release"
        }
    ]
};

export default config;