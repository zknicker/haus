import { type ChildProcess, spawn } from 'node:child_process';
import { constants } from 'node:os';
import type { OutputPipe } from './pi/output-tail.ts';
import { waitForChildProcess } from './pi/shell.ts';

export interface StreamedCommand {
    args: string[];
    cwd?: string;
    executable: string;
    signal: AbortSignal;
}

export async function streamProcess(
    command: StreamedCommand,
    onData: (data: Buffer, pipe: OutputPipe) => void
) {
    const child = spawn(command.executable, command.args, {
        ...(command.cwd ? { cwd: command.cwd } : {}),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data: Buffer) => onData(data, 'stdout'));
    child.stderr.on('data', (data: Buffer) => onData(data, 'stderr'));
    const onAbort = () => child.kill('SIGTERM');
    if (command.signal.aborted) {
        onAbort();
    }
    command.signal.addEventListener('abort', onAbort, { once: true });
    try {
        return exitStatus(child, await waitForChildProcess(child));
    } finally {
        command.signal.removeEventListener('abort', onAbort);
    }
}

export function exitStatus(child: ChildProcess, exitCode: number | null) {
    if (exitCode !== null) {
        return exitCode;
    }
    return child.signalCode ? 128 + (constants.signals[child.signalCode] ?? 0) : 1;
}
