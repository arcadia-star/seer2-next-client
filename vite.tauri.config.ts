import { resolve } from "path";
import { defineConfig } from "vite";

const projectRoot = __dirname;

export default defineConfig({
    root: resolve(projectRoot, "src/tauri"),
    publicDir: false,
    server: {
        host: "127.0.0.1",
        port: 1420,
        strictPort: true,
        fs: {
            allow: [projectRoot],
        },
    },
    build: {
        target: "es2022",
        outDir: resolve(projectRoot, "dist-tauri"),
        emptyOutDir: true,
    },
});
