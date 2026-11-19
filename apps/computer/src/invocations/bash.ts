import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { isProcessGroupAlive } from '../runtime/process-group-liveness.ts';
import {
    type OperationContext,
    type OperationRunner,
    type StopReason,
    textResult,
} from './operation.ts';
import { type OutputPipe, OutputTail } from './pi/output-tail.ts';
import { killProcessTree, signalProcess, waitForChildProcess } from './pi/shell.ts';
import { formatTail } from './pi/tail-notice.ts';
import { exitStatus } from './stream-process.ts';

export const cancelKillGraceMs = 5000;

export const bashRunner: OperationRunner<'bash'> = async (operation, context) => {
    try {
        await access(context.cwd, constants.F_OK);
    } catch {
        throw new Error(
            `Working directory does not exist: ${context.cwd}\nCannot execute bash commands.`
        );
    }
    const output = new OutputTail(context.logPath);
    let run: Awaited<ReturnType<typeof runShell>>;
    try {
        run = await runShell(operation.command, context, (data, pipe) => output.append(data, pipe));
    } finally {
        output.finish();
        await output.close();
    }
    const extra = { logPath: context.logPath, truncated: output.snapshot().truncated };
    if (run.kind === 'exited') {
        const text = formatTail(output, context.logPath, '(no output)');
        return textResult(
            'completed',
            run.exitCode === 0
                ? text
                : appendStatus(text, `Command exited with code ${run.exitCode}`),
            { ...extra, exitCode: run.exitCode }
        );
    }
    const text = formatTail(output, context.logPath, '');
    if (run.reason === 'cancel') {
        return textResult('cancelled', appendStatus(text, 'Command aborted'), extra);
    }
    return textResult(
        'timed-out',
        appendStatus(text, `Command timed out after ${context.timeoutMs / 1000} seconds`),
        extra
    );
};

async function runShell(
    command: string,
    context: OperationContext,
    onData: (data: Buffer, pipe: OutputPipe) => void
) {
    const { signal } = context;
    if (signal.aborted) {
        return { kind: 'stopped' as const, reason: stopReason(signal) };
    }
    const child = spawn('/bin/bash', ['-c', command], {
        cwd: context.cwd,
        detached: true,
        env: context.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stopped: StopReason | undefined;
    let killAt = 0;
    let killTimer: NodeJS.Timeout | undefined;
    child.once('exit', () => {
        if (!stopped && child.pid !== undefined) {
            killGroup(child.pid);
        }
    });
    const onAbort = () => {
        const { pid } = child;
        if (pid === undefined) {
            return;
        }
        stopped = stopReason(signal);
        if (stopped === 'timeout') {
            killGroup(pid);
            return;
        }
        signalProcess(-pid, 'SIGTERM');
        killAt = performance.now() + cancelKillGraceMs;
        killTimer = setTimeout(() => killGroup(pid), cancelKillGraceMs);
    };
    child.stdout.on('data', (data: Buffer) => onData(data, 'stdout'));
    child.stderr.on('data', (data: Buffer) => onData(data, 'stderr'));
    signal.addEventListener('abort', onAbort, { once: true });
    let exitCode: number | null;
    try {
        exitCode = await waitForChildProcess(child);
    } finally {
        signal.removeEventListener('abort', onAbort);
        clearTimeout(killTimer);
    }
    if (stopped === 'cancel' && child.pid !== undefined && isProcessGroupAlive(child.pid)) {
        await delay(Math.max(0, killAt - performance.now()));
        killGroup(child.pid);
    }
    return stopped
        ? { kind: 'stopped' as const, reason: stopped }
        : { exitCode: exitStatus(child, exitCode), kind: 'exited' as const };
}

function killGroup(pid: number) {
    if (isProcessGroupAlive(pid)) {
        killProcessTree(pid);
    }
}

function stopReason(signal: AbortSignal) {
    return signal.reason === 'timeout' ? ('timeout' as const) : ('cancel' as const);
}

function appendStatus(text: string, status: string) {
    return `${text ? `${text}\n\n` : ''}${status}`;
}
