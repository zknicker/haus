import { spawn } from 'node:child_process';
import { isProcessGroupAlive, isSystemErrorCode } from '../../harness/process-group-liveness.ts';
import type { RuntimeProcessRegistry } from '../../harness/sandbox-process-owner.ts';
import { LineDecoder } from '../line-decoder.ts';

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
    processes?: RuntimeProcessRegistry;
}): ClaudeProcess {
    const owner = options.processes;
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
    const stop = () => {
        stopping ??= terminate(child.pid, exited);
        return stopping;
    };
    const overflow = (error: unknown) => {
        stderr.push(error instanceof Error ? error.message : String(error));
        // The exit fails the running turn with this stderr tail.
        stop().catch((cause: unknown) => stderr.push(String(cause)));
    };
    readLines(
        child.stdout,
        (line) => {
            for (const listener of listeners) {
                listener(line);
            }
        },
        overflow
    );
    readLines(
        child.stderr,
        (line) => {
            stderr.push(line);
            if (stderr.length > stderrTailLines) {
                stderr.shift();
            }
        },
        overflow
    );
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

/**
 * Splits a byte stream into non-empty lines through the shared decoder. An oversized line is a
 * protocol failure reported to `onOverflow`, never an unbounded buffer.
 */
export function readLines(
    stream: NodeJS.ReadableStream,
    onLine: (line: string) => void,
    onOverflow: (error: unknown) => void = (error) => {
        throw error;
    }
) {
    const decoder = new LineDecoder();
    const emit = (lines: readonly string[]) => {
        for (const line of lines) {
            if (line.length > 0) {
                onLine(line);
            }
        }
    };
    let failed = false;
    stream.on('data', (chunk: Buffer | string) => {
        if (failed) {
            return;
        }
        let lines: string[];
        try {
            lines = decoder.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        } catch (error) {
            failed = true;
            onOverflow(error);
            return;
        }
        emit(lines);
    });
    stream.on('end', () => {
        if (!failed) {
            emit(decoder.end());
        }
    });
}
