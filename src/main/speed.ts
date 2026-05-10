/**
 * speed.ts — 变速功能核心模块（Named Pipe 队列版）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 架构：
 *   注入：ce_injector.exe <pid> <dllPath>  （仅首次，进程启动后即退出）
 *   变速：Named Pipe  \\.\pipe\Seer2SpeedHack_<pid>
 *
 * 为什么不用 WriteProcessMemory 直写速度变量？
 *   DLL hook 返回的是 virtualBase + (realTime - realBase) * speedFloat。
 *   WPM 只修改 speedFloat 而不更新 virtualBase/realBase，导致从高速切低速时
 *   虚拟时间瞬间倒退，游戏冻结等真实时间追上。
 *   Named Pipe 处理器在 DLL 内原子更新三个变量（virtualBase, realBase, speed），
 *   保证时间连续，彻底消除冻结。
 *
 * DLL 的 pipe 服务器在每次处理完后有 Sleep(500ms)，解决方案：
 *   Pipe Worker 单例：后台任务，序列化所有管道请求，每次最多一个连接在途。
 *   重试逻辑：单次连接超时 200ms，最多重试至总时长 700ms（覆盖 500ms Sleep 窗口）。
 *   末位生效：若用户快速切速，Worker 仅发送最新目标值，中间值被覆盖，不堆积。
 *
 * 架构（x64）：ce_injector.exe 注入 + Named Pipe 变速
 * 架构（ia32）：PowerShell 注入 + Named Pipe 变速（相同 pipe 路径）
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { app, ipcMain }  from 'electron';
import { spawn }         from 'child_process';
import net               from 'net';
import fs                from 'fs';
import path              from 'path';
import { APP_RESOURCES_PATH } from './runtime';

// ── PowerShell 路径 ────────────────────────────────────────────────────────
const sysRoot = process.env.SystemRoot ?? 'C:\\Windows';
export const pshell64 = process.arch === 'x64' ? 'powershell.exe'
    : path.join(sysRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
export const pshell32 = process.arch === 'x64' ? 'powershell.exe'
    : path.join(sysRoot, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// ── 模块状态 ──────────────────────────────────────────────────────────────
let currentGameSpeed = 1.0;
let speedReloadSeq   = 0;

/** 当前已注入的游戏 PID（会话内持久） */
let _injectedPid     = 0;
/** 注入进行中时的 Promise，防止并发重复注入 */
let _injectPromise: Promise<{ ok: boolean; error?: string }> | null = null;

/**
 * Pipe Worker 状态
 * 同一时刻只有一个 Worker 实例在运行（_workerRunning=true），
 * 它不断从 _pipeTarget 取最新速度，发送成功后检查是否有新目标。
 */
let _pipeTarget: number | null = null;   // 最新待发送速度，null = 无待发
let _pipeWorkerPid   = 0;
let _workerRunning   = false;

// ── Reload 时重置 ──────────────────────────────────────────────────────────
export function onGameReload(sendFn: (ch: string, d: unknown) => void): void {
    speedReloadSeq++;

    // ── 实际游戏速度归 1x ──────────────────────────────────────────────────
    // 网页刷新后 Flash 进程有时同 PID 继续运行（DLL 仍注入，速度变量仍有效）。
    // onGameReload 在 did-finish-load / did-navigate 触发时调用，
    // 此时主进程状态即将重置，必须在清除 _injectedPid 之前向 DLL 发 1x 命令，
    // 否则游戏实际速度保持旧值，与面板显示（已回归 1x）不符。
    // 若 Flash 进程已随页面刷新而重启（新 PID），pipe 连接会因 ENOENT 自然失败，无副作用。
    if (_injectedPid > 0) {
        const _resetPid = _injectedPid;
        // 单次尝试，500ms 超时，fire-and-forget
        _pipeConnect(_resetPid, 1.0, 500).catch(() => {});
    }

    _injectedPid   = 0;
    _injectPromise = null;
    _pipeTarget    = null;
    _workerRunning = false;
    _pipeWorkerPid = 0;
    currentGameSpeed = 1.0;
    sendFn('speed-reset', { speed: 1.0 });
}

// ── 路径工具 ──────────────────────────────────────────────────────────────
function ceDllPath(): string {
    const n = process.arch === 'x64' ? 'speedhook_ce_x64.dll' : 'speedhook_ce_ia32.dll';
    return app.isPackaged
        ? path.join(APP_RESOURCES_PATH, 'speedhook', n)
        : path.join(app.getAppPath(),   'speedhook', n);
}
function injExe(): string {
    return app.isPackaged
        ? path.join(APP_RESOURCES_PATH, 'speedhook', 'ce_injector.exe')
        : path.join(app.getAppPath(),   'speedhook', 'ce_injector.exe');
}
function pipePath(pid: number): string {
    return `\\\\.\\pipe\\Seer2SpeedHack_${pid}`;
}

// ── 错误码描述 ──────────────────────────────────────────────────────────────
function injErrDesc(code: number): string {
    if (code >= 1000 && code < 2000) return `OpenProcess失败(Win32 ${code - 1000})`;
    if (code === 2000) return 'VirtualAllocEx失败';
    if (code === 3000) return 'CreateRemoteThread失败';
    if (code === 4000) return 'LoadLibraryW返回NULL(DLL加载失败)';
    if (code === 5000) return '架构不匹配(32/64位)';
    if (code === 6000) return 'DLL文件不存在';
    if (code === 7000) return '注入成功但找不到DLL模块基址';
    return `未知错误码 ${code}`;
}

// ── 辅助：延迟 ──────────────────────────────────────────────────────────────
function _delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ── Named Pipe 单次连接（带超时）──────────────────────────────────────────
/**
 * 连接到 DLL 的 Named Pipe，写入速度字符串，断开连接。
 * DLL 在收到数据后会原子更新 virtualBase + realBase + speedFloat。
 */
function _pipeConnect(pid: number, speed: number, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (r: { ok: boolean; error?: string }) => {
            if (!settled) { settled = true; resolve(r); }
        };

        let c: net.Socket;
        const timer = setTimeout(() => {
            try { c?.destroy(); } catch (_) {}
            settle({ ok: false, error: 'connect timeout' });
        }, timeoutMs);

        try {
            c = net.createConnection(pipePath(pid), () => {
                c.write(String(speed), 'utf8', () => {
                    c.end();
                    clearTimeout(timer);
                    settle({ ok: true });
                });
            });
            c.on('error', (e: NodeJS.ErrnoException) => {
                clearTimeout(timer);
                settle({ ok: false, error: `${e.code ?? 'ERR'}: ${e.message}` });
            });
        } catch (e: any) {
            clearTimeout(timer);
            settle({ ok: false, error: 'net: ' + e.message });
        }
    });
}

// ── Named Pipe 带重试（覆盖 DLL Sleep(500ms) 窗口）───────────────────────
/**
 * 对单次 _pipeConnect 失败自动重试，直到成功或超出 maxWaitMs。
 * - 每次单次连接超时 200ms
 * - 重试间隔 40ms
 * - 总时限 700ms（>500ms Sleep，保证在下一个 ConnectNamedPipe 窗口成功）
 * - 若连续 3 次 ENOENT（pipe 根本不存在），提前放弃（DLL 未加载）
 */
async function _pipeSetWithRetry(
    pid: number, speed: number, maxWaitMs = 700
): Promise<{ ok: boolean; error?: string }> {
    const deadline = Date.now() + maxWaitMs;
    let lastErr = '';
    let enoentCount = 0;

    while (Date.now() < deadline) {
        const r = await _pipeConnect(pid, speed, 200);
        if (r.ok) return { ok: true };

        lastErr = r.error ?? '';
        // ENOENT: pipe 路径不存在，DLL 可能还未初始化完毕，多试几次
        if (lastErr.includes('ENOENT') || lastErr.includes('-4058') /* uv ENOENT */) {
            enoentCount++;
            if (enoentCount >= 4) {
                return { ok: false, error: `管道不存在(ENOENT×4，DLL未加载?): ${lastErr}` };
            }
        }

        const remaining = deadline - Date.now();
        if (remaining > 0) await _delay(Math.min(40, remaining));
    }

    return { ok: false, error: `管道重试超时(${maxWaitMs}ms，最后错误: ${lastErr})` };
}

// ── Pipe Worker（后台单例，序列化所有速度命令）──────────────────────────
/**
 * Worker 逻辑：
 *   循环取最新 _pipeTarget → 发送 → 再检查是否有新目标
 *   若发送失败（pipe 永久故障），Worker 退出，下次 setSpeed IPC 会重启它。
 *   若游戏进程死亡（ENOENT 连续），Worker 退出并清除 _injectedPid。
 */
async function _runPipeWorker(pid: number): Promise<void> {
    _workerRunning  = true;
    _pipeWorkerPid  = pid;

    while (_pipeTarget !== null && _pipeWorkerPid === pid) {
        const speed = _pipeTarget;
        _pipeTarget = null;          // 允许新目标在发送期间累积

        const r = await _pipeSetWithRetry(pid, speed);
        if (!r.ok) {
            console.warn(`[Speed] pipe 最终失败 pid=${pid}: ${r.error}`);
            // 若是 ENOENT 类错误（进程死亡），清除注入状态
            if ((r.error ?? '').includes('ENOENT')) {
                if (_injectedPid === pid) _injectedPid = 0;
            }
            // Worker 退出，下次 IPC 调用时重启（若 _pipeTarget 还有值）
            break;
        }
        // 成功，继续循环检查是否有新目标
    }

    _workerRunning = false;
}

/** 确保 Worker 在运行（若当前无 Worker 或 Worker 的 pid 已变则启动新的） */
function _kickWorker(pid: number): void {
    if (_workerRunning && _pipeWorkerPid === pid) return;   // 已在运行
    // 注意：不 await，Worker 在后台运行
    _runPipeWorker(pid).catch((e) => console.error('[Speed] worker crash:', e));
}

// ── 注入：x64 使用 ce_injector.exe，ia32 使用 PowerShell ─────────────────
function _injectX64(pid: number, dllPath: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        const exe = injExe();
        if (!fs.existsSync(exe)) {
            return resolve({ ok: false, error: 'ce_injector.exe 未找到（构建时未编译？）' });
        }
        let out = '', err = '';
        const proc = spawn(exe, [String(pid), dllPath], {
            windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        });
        proc.stdout?.on('data', (d: Buffer) => { out += d.toString('utf8'); });
        proc.stderr?.on('data', (d: Buffer) => { err += d.toString('utf8'); });
        proc.on('error', (e: Error) => resolve({ ok: false, error: 'spawn: ' + e.message }));
        proc.on('close', () => {
            const lines = out.trim().split(/\r?\n/);
            const code = parseInt(lines[0] ?? '', 10);
            if (code === 0) {
                resolve({ ok: true });
            } else {
                const e2 = injErrDesc(code);
                resolve({ ok: false, error: `注入失败[${code}]: ${e2}${err ? ' | ' + err.trim().slice(0, 150) : ''}` });
            }
        });
        setTimeout(() => {
            try { proc.kill(); } catch (_) {}
            resolve({ ok: false, error: '注入超时(12s)' });
        }, 12000);
    });
}

function _injectPS(pid: number, dllPath: string): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
        const cs = [
            'using System;using System.Runtime.InteropServices;',
            'public class I{',
            '[DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint a,bool b,uint c);',
            '[DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr VirtualAllocEx(IntPtr h,IntPtr a,uint s,uint t,uint p);',
            '[DllImport("kernel32.dll",SetLastError=true)]static extern bool WriteProcessMemory(IntPtr h,IntPtr a,byte[] b,uint s,out uint w);',
            '[DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr CreateRemoteThread(IntPtr h,IntPtr a,uint s,IntPtr f,IntPtr p,uint c,out uint i);',
            '[DllImport("kernel32.dll")]static extern uint WaitForSingleObject(IntPtr h,uint m);',
            '[DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);',
            '[DllImport("kernel32.dll")]static extern IntPtr GetProcAddress(IntPtr m,string n);',
            '[DllImport("kernel32.dll")]static extern IntPtr GetModuleHandle(string n);',
            'public static int Run(uint pid,string dll){',
            'IntPtr hp=OpenProcess(0x1F0FFF,false,pid);if(hp==IntPtr.Zero)return 1000+Marshal.GetLastWin32Error();',
            'byte[] db=System.Text.Encoding.Unicode.GetBytes(dll);',
            'IntPtr m=VirtualAllocEx(hp,IntPtr.Zero,(uint)db.Length+4,0x3000,0x40);',
            'if(m==IntPtr.Zero){CloseHandle(hp);return 2000;}',
            'uint w;WriteProcessMemory(hp,m,db,(uint)db.Length,out w);',
            'IntPtr ll=GetProcAddress(GetModuleHandle("kernel32.dll"),"LoadLibraryW");uint tid;',
            'IntPtr ht=CreateRemoteThread(hp,IntPtr.Zero,0,ll,m,0,out tid);',
            'if(ht==IntPtr.Zero){CloseHandle(hp);return 3000;}',
            'WaitForSingleObject(ht,8000);CloseHandle(ht);CloseHandle(hp);return 0;}}',
        ].join('\n').replace(/'/g, "''");
        const dp = dllPath.replace(/'/g, "''");
        const cmd = `Add-Type -TypeDefinition '${cs}' -Language CSharp -EA Stop;Write-Output ([I]::Run(${pid},'${dp}'))`;
        let out = '', err = '';
        const p = spawn(pshell32,
            ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', cmd],
            { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        p.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
        p.on('error', (e: Error) => resolve({ ok: false, error: 'spawn: ' + e.message }));
        p.on('close', () => {
            const r = parseInt(out.trim(), 10);
            if (r === 0) resolve({ ok: true });
            else resolve({ ok: false, error: `PS注入[${r}]: ${injErrDesc(r)}${err ? ' | ' + err.trim().slice(0, 100) : ''}` });
        });
        setTimeout(() => { try { p.kill(); } catch (_) {} resolve({ ok: false, error: '注入超时(12s)' }); }, 12000);
    });
}

/**
 * 确保当前 pid 的 DLL 已注入。
 * 多个并发 IPC 调用会共享同一个 _injectPromise，只注入一次。
 */
async function _ensureInjected(pid: number, dllPath: string): Promise<{ ok: boolean; error?: string }> {
    if (_injectedPid === pid) return { ok: true };

    // 已有注入进行中，等待其完成
    if (_injectPromise) return _injectPromise;

    if (!fs.existsSync(dllPath)) {
        return { ok: false, error: path.basename(dllPath) + ' 文件缺失' };
    }

    _injectPromise = (async () => {
        // 选择注入器
        const r = (process.arch === 'x64' && fs.existsSync(injExe()))
            ? await _injectX64(pid, dllPath)
            : await _injectPS(pid, dllPath);

        if (r.ok) {
            _injectedPid = pid;
            // 等待 DLL 内的 pipe 服务器初始化就绪
            // DLL 的管道服务器启动需要很短的时间；此处 300ms 保守等待
            await _delay(300);
        }

        _injectPromise = null;
        return r;
    })();

    return _injectPromise;
}

// ── PPAPI 进程扫描 ────────────────────────────────────────────────────────
function _findPpapi(): { pid: number; type: string } | null {
    try {
        const metrics = app.getAppMetrics();
        for (const m of metrics) {
            const t = (m.type ?? '').toLowerCase();
            if ((t === 'pepper plugin' || t === 'ppapi plugin') && m.pid)
                return { pid: m.pid, type: m.type };
        }
        for (const m of metrics) {
            const t = (m.type ?? '').toLowerCase();
            if ((t.includes('pepper') || t.includes('ppapi') || t.includes('plugin'))
                && !t.includes('broker') && m.pid)
                return { pid: m.pid, type: m.type };
        }
    } catch (e: any) { console.warn('[Speed] findPpapi:', e.message); }
    return null;
}

// ── IPC 注册 ──────────────────────────────────────────────────────────────
export function registerSpeedIpc(): void {

    ipcMain.handle('set-game-speed', async (_, rawFactor: number) => {
        const factor = Math.max(0.1, Math.min(3.0, Number(rawFactor) || 1.0));
        currentGameSpeed = factor;
        const fps    = Math.round(24 * factor);
        const is1x   = Math.abs(factor - 1.0) < 0.005;
        const method = is1x ? 'normal' : 'CEHook';

        const pp = _findPpapi();
        if (!pp) {
            return { ok: false, error: 'Flash PPAPI 进程未就绪，请等游戏完全加载后再使用变速' };
        }
        const ppPid = pp.pid;

        // ── 注入（首次或 pid 变更后需要）─────────────────────────────────
        // 注入是同步阻塞的（12s 超时），防止 pipe 还没启动就发命令。
        // 多个并发 IPC 调用会等同一个 _injectPromise。
        const dllPath = ceDllPath();
        const injectResult = await _ensureInjected(ppPid, dllPath);
        if (!injectResult.ok) return { ok: false, error: injectResult.error };

        // ── 1x 且无待发目标：直接走 pipe 恢复速度 ────────────────────────
        // （即使 is1x，也需要通知 DLL 重置时间基线，否则游戏速度不变）

        // 设置最新目标速度，Worker 会取最新值发送
        _pipeTarget = factor;

        // 启动/确认 Worker 在运行
        _kickWorker(ppPid);

        // 立即返回（乐观成功）。实际 pipe 发送在后台异步完成（通常 <10ms）。
        return { ok: true, fps, method, pid: ppPid };
    });

    ipcMain.handle('get-game-speed', () => {
        const pp = _findPpapi();
        let rnPid = 0;
        try {
            const rn = app.getAppMetrics().find(m => (m.type ?? '').toLowerCase() === 'renderer');
            rnPid = rn?.pid ?? 0;
        } catch (_) {}
        return {
            ok:        true,
            running:   !!(pp?.pid),
            speed:     currentGameSpeed,
            hooked:    _injectedPid > 0 && _injectedPid === (pp?.pid ?? 0),
            injecting: _injectPromise !== null,
            ppPid:     pp?.pid ?? 0,
            rnPid,
        };
    });
}
