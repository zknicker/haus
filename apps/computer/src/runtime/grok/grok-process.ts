import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { DaemonRuntime } from '../../daemon-runtime.ts';
import { isSystemErrorCode } from '../../harness/process-group-liveness.ts';
import { sandboxProcessOwner } from '../../harness/sandbox-process-owner.ts';
import { AcpConnection } from './acp-connection.ts';
import { LineDecoder } from './line-decoder.ts';

/** One frame on the ACP wire, for fixture capture. */
export interface GrokWireFrame {
    readonly direction: 'in' | 'out' | 'stderr';
    readonly line: string;
}

export interface GrokProcessOptions {
    readonly args: readonly string[];
    /** argv prefix that runs Grok: the resolved `grok`, or a test stand-in. */
    readonly command: readonly [string, ...string[]];
    readonly cwd: string;
    readonly env: Record<string, string>;
    readonly runtime: DaemonRuntime;
    readonly wireTap?: (frame: GrokWireFrame) => void;
}

export interface GrokExit {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
}

/** A live `grok agent stdio` child in its own process group, with its ACP connection. */
export interface GrokProcess {
    readonly connection: AcpConnection;
    readonly exited: Promise<GrokExit>;
    readonly pid: number | undefined;
    /** The last stderr lines, for failure messages. */
    stderrTail(): string;
    /** SIGTERM to the group, then SIGKILL; resolves once the child exited. */
    terminate(): Promise<void>;
}

const TERMINATE_GRACE_MS = 2000;
const STDERR_TAIL_LINES = 20;

export function spawnGrokProcess(options: GrokProcessOptions): GrokProcess {
    const owner = sandboxProcessOwner(options.runtime);
    owner.assertOpen();
    const [executable, ...prefix] = options.command;
    const child = spawn(executable, [...prefix, ...options.args], {
        cwd: options.cwd,
        // Its own group: Grok's shell commands die with it.
        detached: process.platform !== 'win32',
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stderr: string[] = [];
    const connection = new AcpConnection({
        // A write fails when Grok never started or already exited; its exit reason (missing
        // binary, crash with stderr) says more than EPIPE, so it wins once the exit lands.
        write: (line) =>
            writeLine(child, line, options).catch(async (error: unknown) => {
                await exitsWithin(exited, TERMINATE_GRACE_MS);
                throw connection.closed ?? error;
            }),
    });
    // EPIPE after Grok exits: the failed write's own callback rejects that write, and the exit
    // closes the connection with Grok's stderr. Without a listener the error would crash Computer.
    child.stdin.on('error', () => undefined);
    const exited = watchExit(child, connection, stderr);
    pipeStdout(child, connection, options);
    pipeStderr(child, stderr, options);
    let terminating: Promise<void> | null = null;
    const terminate = () => {
        terminating ??= terminateGroup(child, exited);
        return terminating;
    };
    owner.add(terminate);
    void exited.then(() => owner.remove(terminate));
    return {
        connection,
        exited,
        pid: child.pid,
        stderrTail: () => stderr.join('\n'),
        terminate,
    };
}

function writeLine(
    child: ChildProcessWithoutNullStreams,
    line: string,
    options: GrokProcessOptions
): Promise<void> {
    options.wireTap?.({ direction: 'out', line });
    return new Promise((resolve, reject) => {
        if (!child.stdin.writable) {
            reject(new Error('Grok stdin is closed.'));
            return;
        }
        child.stdin.write(`${line}\n`, (error) => (error ? reject(error) : resolve()));
    });
}

function pipeStdout(
    child: ChildProcessWithoutNullStreams,
    connection: AcpConnection,
    options: GrokProcessOptions
) {
    const decoder = new LineDecoder();
    const deliver = (lines: string[]) => {
        for (const line of lines) {
            options.wireTap?.({ direction: 'in', line });
            connection.receiveLine(line);
        }
    };
    child.stdout.on('data', (chunk: Buffer) => {
        try {
            deliver(decoder.push(chunk));
        } catch (error) {
            connection.close(error instanceof Error ? error : new Error(String(error)));
            child.kill('SIGKILL');
        }
    });
    child.stdout.on('end', () => deliver(decoder.end()));
}

function pipeStderr(
    child: ChildProcessWithoutNullStreams,
    tail: string[],
    options: GrokProcessOptions
) {
    const decoder = new LineDecoder();
    const keep = (lines: string[]) => {
        for (const line of lines) {
            options.wireTap?.({ direction: 'stderr', line });
            tail.push(stripAnsi(line).slice(0, 2000));
            if (tail.length > STDERR_TAIL_LINES) {
                tail.shift();
            }
        }
    };
    child.stderr.on('data', (chunk: Buffer) => keep(decoder.push(chunk)));
    child.stderr.on('end', () => keep(decoder.end()));
}

function watchExit(
    child: ChildProcessWithoutNullStreams,
    connection: AcpConnection,
    stderr: string[]
): Promise<GrokExit> {
    return new Promise((resolve) => {
        child.once('error', (error) => {
            const reason = isSystemErrorCode(error, 'ENOENT')
                ? new Error('The Grok Build CLI (`grok`) is not installed or not on PATH.', {
                      cause: error,
                  })
                : error;
            connection.close(reason);
            if (child.pid === undefined) {
                resolve({ code: null, signal: null });
            }
        });
        child.once('close', (code, signal) => {
            const detail = stderr.length > 0 ? `: ${stderr.slice(-5).join(' | ')}` : '';
            connection.close(
                new Error(`Grok exited (${signal ?? `code ${code ?? 'unknown'}`})${detail}`)
            );
            resolve({ code, signal });
        });
    });
}

async function terminateGroup(child: ChildProcessWithoutNullStreams, exited: Promise<GrokExit>) {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
        return;
    }
    signalGroup(child, 'SIGTERM');
    if (await exitsWithin(exited, TERMINATE_GRACE_MS)) {
        return;
    }
    signalGroup(child, 'SIGKILL');
    if (!(await exitsWithin(exited, TERMINATE_GRACE_MS))) {
        throw new Error(`Grok process ${child.pid} did not terminate.`);
    }
}

function signalGroup(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) {
    try {
        if (process.platform === 'win32' || child.pid === undefined) {
            child.kill(signal);
            return;
        }
        process.kill(-child.pid, signal);
    } catch (error) {
        if (!isSystemErrorCode(error, 'ESRCH')) {
            throw error;
        }
    }
}

async function exitsWithin(exited: Promise<GrokExit>, ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
    });
    try {
        return await Promise.race([exited.then(() => true as const), timeout]);
    } finally {
        clearTimeout(timer);
    }
}

function stripAnsi(line: string): string {
    return line.replace(/\u001b\[[0-9;]*m/gu, '');
}
