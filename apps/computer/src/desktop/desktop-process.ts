import { spawn } from 'node:child_process';
import { stoppedOutcome, textResult } from '../invocations/operation.ts';
import { OutputTail } from '../invocations/pi/output-tail.ts';
import { killProcessTree, waitForChildProcess } from '../invocations/pi/shell.ts';
import { formatTail } from '../invocations/pi/tail-notice.ts';
import { exitStatus } from '../invocations/stream-process.ts';

export interface DesktopProcess {
    args: string[];
    cwd?: string;
    env: Record<string, string>;
    executable: string;
    logPath: string;
    signal: AbortSignal;
}

export async function runDesktopProcess(command: DesktopProcess) {
    const output = new OutputTail(command.logPath);
    let exitCode: number;
    try {
        const child = spawnDesktopProcess(command);
        child.stdout.on('data', (data: Buffer) => output.append(data, 'stdout'));
        child.stderr.on('data', (data: Buffer) => output.append(data, 'stderr'));
        exitCode = exitStatus(child, await waitForChildProcess(child));
    } finally {
        output.finish();
        await output.close();
    }
    const text = formatTail(output, command.logPath, '');
    const extra = { logPath: command.logPath, truncated: output.snapshot().truncated };
    const stopped = stoppedOutcome(command.signal);
    return stopped
        ? textResult(stopped, text, extra)
        : textResult('completed', text, { ...extra, exitCode });
}

export function spawnDesktopProcess(command: Omit<DesktopProcess, 'logPath'>) {
    const child = spawn(command.executable, command.args, {
        ...(command.cwd ? { cwd: command.cwd } : {}),
        detached: true,
        env: { ...process.env, ...command.env },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const kill = () => {
        if (child.pid !== undefined) {
            killProcessTree(child.pid);
        }
    };
    if (command.signal.aborted) {
        kill();
    }
    command.signal.addEventListener('abort', kill, { once: true });
    child.once('close', () => command.signal.removeEventListener('abort', kill));
    return child;
}
