import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { DaemonRuntime } from '../../daemon-runtime.ts';
import { isProcessGroupAlive, isSystemErrorCode } from '../../harness/process-group-liveness.ts';
import { sandboxProcessOwner } from '../../harness/sandbox-process-owner.ts';

const stderrTailLines = 20;
const terminationGraceMs = 2000;

export interface ClaudeExit {
    readonly code: number | null;
    readonly signal: string | null;
}

/** One `claude` child: newline-delimited stdin writes, stdout lines, a bounded stderr tail. */
export interface ClaudeProcess {
    readonly alive: boolean;
    readonly exited: Promise<ClaudeExit>;
    /** Every complete stdout line, in order; partial lines wait for their newline. */
    onLine(listener: (line: string) => void): () => void;
    readonly pid: number | undefined;
    stderrTail(): readonly string[];
    /** Ends the process group: SIGTERM, then SIGKILL after a grace period. */
    stop(): Promise<void>;
    /** Resolves once the line is flushed to the child's stdin; rejects if it cannot be. */
    write(line: string): Promise<void>;
}

export function spawnClaudeProcess(options: {
    args: readonly string[];
    binaryPath: string;
    cwd: string;
    env: Record<string, string>;
    /** Ties the child to Computer shutdown (`sandbox-process-owner.ts`). */
    runtime?: DaemonRuntime;
}): ClaudeProcess {
    const owner = options.runtime ? sandboxProcessOwner(options.runtime) : undefined;
    owner?.assertOpen();
    const child = spawn(options.binaryPath, [...options.args], {
        cwd: options.cwd,
        // Its own process group, so a stop reaches the shells and tools it started.
        detached: process.platform !== 'win32',
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const listeners = new Set<(line: string) => void>();
    const stderr: string[] = [];
    let alive = true;
    let stopping: Promise<void> | undefined;
    const exited = new Promise<ClaudeExit>((resolve) => {
        child.once('error', (error) => {
            stderr.push(error.message);
            if (child.pid === undefined) {
                alive = false;
                resolve({ code: null, signal: null });
            }
        });
        // `close` follows the last stdout byte, so a result printed before exit is never lost;
        // a descendant holding stdout open must not keep a dead process alive, though.
        child.once('close', (code, signal) => {
            alive = false;
            resolve({ code, signal });
        });
        child.once('exit', (code, signal) => {
            setTimeout(() => {
                alive = false;
                resolve({ code, signal });
            }, terminationGraceMs).unref();
        });
    });
    // A write racing the child's exit fails its own promise; the stream error is that failure.
    child.stdin.on('error', () => undefined);
    readLines(child.stdout, (line) => {
        for (const listener of listeners) {
            listener(line);
        }
    });
    readLines(child.stderr, (line) => {
        stderr.push(line);
        if (stderr.length > stderrTailLines) {
            stderr.shift();
        }
    });
    const stop = () => {
        stopping ??= terminate(child.pid, exited);
        return stopping;
    };
    owner?.add(stop);
    void exited.then(() => owner?.remove(stop));
    return {
        get alive() {
            return alive;
        },
        exited,
        onLine(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        pid: child.pid,
        stderrTail: () => [...stderr],
        stop,
        write(line) {
            return new Promise((resolve, reject) => {
                if (!alive || child.stdin.destroyed || child.stdin.writableEnded) {
                    reject(new Error('Claude Code stdin is closed.'));
                    return;
                }
                child.stdin.write(`${line}\n`, (error) => (error ? reject(error) : resolve()));
            });
        },
    };
}

async function terminate(pid: number | undefined, exited: Promise<ClaudeExit>): Promise<void> {
    if (pid === undefined) {
        return;
    }
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
        signalGroup(pid, signal);
        const done = await Promise.race([
            exited.then(() => !isProcessGroupAlive(pid)),
            Bun.sleep(terminationGraceMs).then(() => false),
        ]);
        if (done) {
            return;
        }
    }
    if (isProcessGroupAlive(pid)) {
        throw new Error(`Claude Code process group ${pid} did not terminate.`);
    }
}

function signalGroup(pid: number, signal: NodeJS.Signals) {
    try {
        process.kill(process.platform === 'win32' ? pid : -pid, signal);
    } catch (error) {
        if (!isSystemErrorCode(error, 'ESRCH')) {
            throw error;
        }
    }
}

/** Splits a byte stream into lines, decoding UTF-8 across chunk boundaries. */
export function readLines(stream: NodeJS.ReadableStream, onLine: (line: string) => void) {
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    const drain = (final: boolean) => {
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
            emit(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
        }
        if (final && buffer.length > 0) {
            emit(buffer);
            buffer = '';
        }
    };
    const emit = (line: string) => {
        const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
        if (trimmed.length > 0) {
            onLine(trimmed);
        }
    };
    stream.on('data', (chunk: Buffer | string) => {
        buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
        drain(false);
    });
    stream.on('end', () => {
        buffer += decoder.end();
        drain(true);
    });
}
