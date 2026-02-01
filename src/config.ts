export type DynMenu = {
    label: string;
    url?: string;
    externalUrl?: string;
    role?: string;
    submenu?: DynMenu[];
};

export const config: { menus: DynMenu[] } = {
    menus: [
        {
            label: "⭐主菜单",
            submenu: [
                { label: "刷新网页", role: "reload" },
                { label: "★游戏主页", url: "http://jl.client/jl/play-local.html" },
                { label: "本地代理", url: "http://127.0.0.1:7337/jl/play-local.html" },
                { label: "S2改服主页", url: "http://733702.xyz" },
                { label: "退出", role: "close" },
            ],
        },
        {
            label: "🪟调整窗口",
            submenu: [
                { label: "全屏", role: "togglefullscreen" },
                { label: "控制台", role: "toggleDevTools" },
                { label: "缩放=", role: "resetZoom" },
                { label: "缩放+", role: "zoomIn" },
                { label: "缩放-", role: "zoomOut" },
                { label: "关于", role: "about" },
            ],
        },
    ],
};
