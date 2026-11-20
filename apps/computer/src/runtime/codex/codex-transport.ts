import { spawn } from 'node:child_process';
import { LineDecoder } from '../line-decoder.ts';
import { ownProcessGroup } from '../process-group.ts';

/** How the app-server ended: an exit code, or the signal that killed it. */
export interface CodexExit {
    readonly code: number | null;
    readonly signal: string | null;
}

/**
 * A line-oriented duplex to one `codex app-server`. The process transport is production; tests
 * replay recorded fixtures through the same seam.
 */
export interface CodexTransport {
    readonly exited: Promise<CodexExit>;
    /** Ends the app-server and everything it started; resolves once it has exited. */
    kill(): Promise<void>;
    onLine(listener: (line: string) => void): void;
    /** The last stderr output, for failure messages. */
    stderrTail(): string;
    /** Resolves once the line is flushed to the app-server's stdin. */
    write(line: string): Promise<void>;
}

export interface CodexProcessLaunch {
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env: Record<string, string>;
    readonly executable: string;
}

const STDERR_TAIL_BYTES = 8192;
const TERMINATION_GRACE_MS = 2000;

/**
 * Spawns the app-server as its own process group, so stopping it also ends the shells and MCP
 * servers it started.
 */
export function spawnCodexProcess(launch: CodexProcessLaunch): CodexTransport {
    const child = spawn(launch.executable, [...launch.args], {
        cwd: launch.cwd,
        detached: process.platform !== 'win32',
        env: launch.env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const listeners: Array<(line: string) => void> = [];
    const decoder = new LineDecoder();
    const deliver = (lines: string[]) => {
        for (const line of lines) {
            if (line.trim().length > 0) {
                for (const listener of listeners) {
                    listener(line);
                }
            }
        }
    };
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
        try {
            deliver(decoder.push(chunk));
        } catch (error) {
            // An oversized line is a protocol failure: end the app-server rather than buffer it.
            stderr = `${stderr}\n${error instanceof Error ? error.message : String(error)}`;
            child.kill('SIGKILL');
        }
    });
    child.stdout?.on('end', () => deliver(decoder.end()));
    child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
    });
    const exited = new Promise<CodexExit>((resolve) => {
        child.once('error', (error) => {
            stderr = `${stderr}\n${error.message}`.slice(-STDERR_TAIL_BYTES);
            resolve({ code: null, signal: null });
        });
        child.once('close', (code, signal) => resolve({ code, signal }));
    });
    // A write after exit fails through `exited`; the stream error itself carries nothing more.
    child.stdin?.on('error', () => undefined);
    const terminate = ownProcessGroup({
        exited,
        graceMs: TERMINATION_GRACE_MS,
        label: 'The Codex app-server',
        pid: child.pid,
    });
    return {
        exited,
        kill: () => {
            child.stdin?.end();
            return terminate();
        },
        onLine(listener) {
            listeners.push(listener);
        },
        stderrTail: () => stderr.trim(),
        write(line) {
            return new Promise<void>((resolve, reject) => {
                const stdin = child.stdin;
                if (!stdin || stdin.destroyed || child.exitCode !== null) {
                    reject(new Error('The Codex app-server is not running.'));
                    return;
                }
                stdin.write(`${line}\n`, (error) => (error ? reject(error) : resolve()));
            });
        },
    };
}
