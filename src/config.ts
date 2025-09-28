export type DynMenu = {
    label: string;
    url?: string;
    externalUrl?: string;
    role?: string;
    submenu?: DynMenu[];
}

export const config: { menus: DynMenu[] } = {
    menus: [
        {
            label: '⭐主菜单',
            submenu: [
                {label: '刷新网页', role: 'reload'},
                {label: '★游戏主页', url: 'http://127.0.0.1:7337/seer2/play-local.html'},
                {label: '★改服主页', url: 'http://733702.xyz'},
                {label: '赛尔号，启动！', url: 'https://seer.61.com/play.shtml'},
                {label: '原神，启动！', url: 'https://ys.mihoyo.com/cloud/'},
                {label: '★下载更新', externalUrl: 'https://github.com/arcadia-star/seer2-next-client-release/releases'},
                {label: '★下载更新(网盘)', externalUrl: 'https://www.123865.com/s/QwODjv-AjoJh'},
                {label: '退出', role: 'close'},
            ]
        },
        {
            label: '🪟调整窗口',
            submenu: [
                {label: '全屏', role: 'togglefullscreen'},
                {label: '控制台', role: 'toggleDevTools'},
                {label: '缩放=', role: 'resetZoom'},
                {label: '缩放+', role: 'zoomIn'},
                {label: '缩放-', role: 'zoomOut'},
                {label: '关于', role: 'about'}
            ]
        }
    ]
}