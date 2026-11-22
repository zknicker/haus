import { stoppedOutcome, textResult } from '../invocations/operation.ts';
import { OutputTail } from '../invocations/pi/output-tail.ts';
import { waitForChildProcess } from '../invocations/pi/shell.ts';
import { formatTail } from '../invocations/pi/tail-notice.ts';
import { exitStatus } from '../invocations/stream-process.ts';
import type { LockedDesktop } from './desktop-lock.ts';

export async function runDesktopProcess(
    desktop: LockedDesktop,
    command: { logPath: string; signal: AbortSignal }
) {
    const output = new OutputTail(command.logPath);
    const { child } = desktop;
    let exitCode: number;
    try {
        child.stdout?.on('data', (data: Buffer) => output.append(data, 'stdout'));
        child.stderr?.on('data', (data: Buffer) => output.append(data, 'stderr'));
        desktop.start();
        exitCode = exitStatus(child, await waitForChildProcess(child));
    } finally {
        desktop.finish();
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
