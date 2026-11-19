import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { isProcessGroupAlive } from '../runtime/process-group-liveness.ts';
import {
    type OperationContext,
    type OperationRunner,
    type StopReason,
    textResult,
} from './operation.ts';
import { OutputTail } from './pi/output-tail.ts';
import { killProcessTree, signalProcess, waitForChildProcess } from './pi/shell.ts';
import { tailNotice } from './pi/tail-notice.ts';

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
        run = await runShell(operation.command, context, (data) => output.append(data));
    } finally {
        output.finish();
        await output.close();
    }
    const extra = { logPath: context.logPath, truncated: output.snapshot().truncated };
    if (run.kind === 'exited') {
        const text = formatOutput(output, context.logPath, '(no output)');
        return textResult(
            'completed',
            run.exitCode === 0
                ? text
                : appendStatus(text, `Command exited with code ${run.exitCode}`),
            { ...extra, exitCode: run.exitCode }
        );
    }
    const text = formatOutput(output, context.logPath, '');
    if (run.reason === 'cancel') {
        return textResult('cancelled', appendStatus(text, 'Command aborted'), extra);
    }
    let status = `Command timed out after ${context.timeoutMs / 1000} seconds`;
    if (run.shellExit) {
        status += `. The shell exited with code ${run.shellExit.exitCode} after ${run.shellExit.afterSeconds} seconds, but background processes it started kept writing output until the timeout.`;
    }
    return textResult('timed-out', appendStatus(text, status), extra);
};

async function runShell(
    command: string,
    context: OperationContext,
    onData: (data: Buffer) => void
) {
    const { signal } = context;
    if (signal.aborted) {
        return { kind: 'stopped' as const, reason: stopReason(signal), shellExit: undefined };
    }
    const child = spawn('/bin/bash', ['-c', command], {
        cwd: context.cwd,
        detached: true,
        env: context.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const startedAt = performance.now();
    let shellExitedAfterMs: number | undefined;
    child.once('exit', () => {
        shellExitedAfterMs = performance.now() - startedAt;
    });
    let stopped: { exitedAfterMs: number | undefined; reason: StopReason } | undefined;
    let killAt = 0;
    let killTimer: NodeJS.Timeout | undefined;
    const onAbort = () => {
        const { pid } = child;
        if (pid === undefined) {
            return;
        }
        stopped = { exitedAfterMs: shellExitedAfterMs, reason: stopReason(signal) };
        if (stopped.reason === 'timeout') {
            killGroup(pid);
            return;
        }
        signalProcess(-pid, 'SIGTERM');
        killAt = performance.now() + cancelKillGraceMs;
        killTimer = setTimeout(() => killGroup(pid), cancelKillGraceMs);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    signal.addEventListener('abort', onAbort, { once: true });
    let exitCode: number | null;
    try {
        exitCode = await waitForChildProcess(child);
    } finally {
        signal.removeEventListener('abort', onAbort);
        clearTimeout(killTimer);
    }
    if (stopped?.reason === 'cancel' && child.pid !== undefined && isProcessGroupAlive(child.pid)) {
        await delay(Math.max(0, killAt - performance.now()));
        killGroup(child.pid);
    }
    const signalCode = child.signalCode;
    const resolvedExitCode =
        exitCode ?? (signalCode ? 128 + (osConstants.signals[signalCode] ?? 0) : 1);
    if (!stopped) {
        return { exitCode: resolvedExitCode, kind: 'exited' as const };
    }
    return {
        kind: 'stopped' as const,
        reason: stopped.reason,
        shellExit:
            stopped.exitedAfterMs === undefined
                ? undefined
                : {
                      afterSeconds: Math.round(stopped.exitedAfterMs / 100) / 10,
                      exitCode: resolvedExitCode,
                  },
    };
}

function killGroup(pid: number) {
    if (isProcessGroupAlive(pid)) {
        killProcessTree(pid);
    }
}

function stopReason(signal: AbortSignal) {
    return signal.reason === 'timeout' ? ('timeout' as const) : ('cancel' as const);
}

function formatOutput(output: OutputTail, logPath: string, emptyText: string) {
    const truncation = output.snapshot();
    const text = truncation.content || emptyText;
    return truncation.truncated
        ? `${text}\n\n${tailNotice(truncation, logPath, output.lastLineBytes())}`
        : text;
}

function appendStatus(text: string, status: string) {
    return `${text ? `${text}\n\n` : ''}${status}`;
}
