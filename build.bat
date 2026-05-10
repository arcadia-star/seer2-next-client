@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title seer2-next-client Build Pipeline [x64 + ia32 + 双架构]

echo ================================================================
echo  seer2-next-client Build Pipeline
echo  输出: dist\ (x64/ia32)  dist-dual\ (双架构)
echo ================================================================
echo.

REM ── 检测本地代理 ────────────────────────────────────────────────────
netstat -ano 2>nul | findstr ":10808 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo [PROXY] 检测到本地代理 127.0.0.1:10808，已启用
    set HTTP_PROXY=http://127.0.0.1:10808
    set HTTPS_PROXY=http://127.0.0.1:10808
    set npm_config_proxy=http://127.0.0.1:10808
    set npm_config_https_proxy=http://127.0.0.1:10808
) else (
    echo [PROXY] 未检测到本地代理，启用国内镜像加速
    set npm_config_registry=https://registry.npmmirror.com
    set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
    echo [MIRROR] npm      ^> npmmirror.com
    echo [MIRROR] electron ^> npmmirror.com
)
echo.

REM ── 检测并安装 pnpm ─────────────────────────────────────────────────
where pnpm >nul 2>&1
if errorlevel 1 (
    echo [PNPM] 未检测到 pnpm，正在安装...
    call npm install -g pnpm
    if errorlevel 1 (
        echo [ERROR] pnpm 安装失败，请手动执行: npm install -g pnpm
        pause
        exit /b 1
    )
    echo [OK]  pnpm 安装完成
) else (
    for /f "delims=" %%v in ('pnpm --version 2^>nul') do echo [OK]  pnpm %%v 已就绪
)
echo.

REM ── 安装依赖（有缓存时极快）─────────────────────────────────────────
echo [PREP] 执行 pnpm install...
call pnpm install
if errorlevel 1 (
    echo [ERROR] pnpm install 失败
    pause
    exit /b 1
)
echo [OK]  依赖就绪
echo.

REM ── 预下载 Electron 二进制（x64）────────────────────────────────────
REM pnpm v10 默认屏蔽 electron install script，二进制不会被自动下载。
REM 直接运行 install.js 触发下载，比 node -e "require('electron')" 可靠。
echo [PREP] 预下载 Electron x64 二进制...
set npm_config_arch=x64
node node_modules\electron\install.js
if errorlevel 1 (
    echo [WARN] Electron x64 预下载异常，electron-builder 将自动重试
) else (
    echo [OK]  Electron x64 就绪
)
echo.

REM ── 预下载 Electron 二进制（ia32）───────────────────────────────────
echo [PREP] 预下载 Electron ia32 二进制...
set npm_config_arch=ia32
node node_modules\electron\install.js
if errorlevel 1 (
    echo [WARN] Electron ia32 预下载异常，electron-builder 将自动重试
) else (
    echo [OK]  Electron ia32 就绪
)
set npm_config_arch=
echo.

REM ── TS 编译（只执行一次，三个包共用产物）────────────────────────────
echo ================================================================
echo  [TS] 编译 TypeScript (electron-vite build)...
echo ================================================================
REM —— 编译 ce_injector.exe（变速注入器，每次 build 自动编译）
echo ================================================================
echo  [SPEEDHOOK] 编译 ce_injector.exe (x64)...
echo ================================================================
set "CSC_PATH="
for %%d in (
  "%WINDIR%\Microsoft.NET\Framework64\v4.0.30319"
  "%WINDIR%\Microsoft.NET\Framework64\v3.5"
  "%WINDIR%\Microsoft.NET\Framework\v4.0.30319"
  "%WINDIR%\Microsoft.NET\Framework\v3.5"
) do (
  if exist "%%~d\csc.exe" if not defined CSC_PATH set "CSC_PATH=%%~d\csc.exe"
)
if not defined CSC_PATH (
  echo [ERROR] 未找到 csc.exe，需要 .NET Framework 4.x
  echo         请安装 .NET Framework 4.x 后重试
  pause ^& exit /b 1
)
echo [INFO] 编译器: %CSC_PATH%
"%CSC_PATH%" /target:exe /out:"speedhook\ce_injector.exe" /platform:x64 "speedhook\injector_src.cs"
if errorlevel 1 (
  echo [ERROR] ce_injector.exe 编译失败
  pause ^& exit /b 1
)
echo [OK]  ce_injector.exe 编译完成
echo.

call pnpm run prebuild
if errorlevel 1 (
    echo [ERROR] TypeScript 编译失败
    pause
    exit /b 1
)
echo [OK]  编译完成，产物在 out\
echo.

REM ── 构建 x64 ────────────────────────────────────────────────────────
echo ================================================================
echo  [x64] 构建 64 位安装包...
echo ================================================================
call npx electron-builder --config build-x64.json
if errorlevel 1 (
    echo [ERROR] x64 构建失败
    pause
    exit /b 1
)
echo [OK]  x64 构建完成
echo.

REM ── 构建 ia32 ───────────────────────────────────────────────────────
echo ================================================================
echo  [ia32] 构建 32 位安装包...
echo ================================================================
call npx electron-builder --config build-ia32.json
if errorlevel 1 (
    echo [WARN] ia32 首次失败，重试一次...
    call npx electron-builder --config build-ia32.json
    if errorlevel 1 (
        echo [ERROR] ia32 构建失败
        pause
        exit /b 1
    )
)
echo [OK]  ia32 构建完成
echo.

REM ── 构建双架构混合包 ────────────────────────────────────────────────
echo ================================================================
echo  [DUAL] 构建双架构混合安装包...
echo ================================================================
call npx electron-builder --config build-dual.json
if errorlevel 1 (
    echo [ERROR] 双架构构建失败
    pause
    exit /b 1
)
echo [OK]  双架构构建完成
echo.

REM ── 完成 ────────────────────────────────────────────────────────────
echo ================================================================
echo  SUCCESS! 全部构建完成
echo ================================================================
echo.
echo 产物目录:
echo   dist\         ^(x64 与 ia32 单架构安装包^)
echo   dist-dual\    ^(双架构混合安装包^)
echo.
echo 生成的安装包:
for /f "delims=" %%F in ('dir /b "dist\*.exe" 2^>nul') do echo   dist\%%F
for /f "delims=" %%F in ('dir /b "dist-dual\*.exe" 2^>nul') do echo   dist-dual\%%F
echo.
echo ================================================================
pause
