import { runAgentBrowserCommand } from '../browser/agent-command.ts';
import { type OperationRunner, stoppedOutcome, textResult } from './operation.ts';
import { OutputTail } from './pi/output-tail.ts';
import { formatTail } from './pi/tail-notice.ts';
import { type StreamedCommand, streamProcess } from './stream-process.ts';

export function createBrowserRunner(input: { browserRoot: string }) {
    const runner: OperationRunner<'browser'> = async (operation, context) => {
        try {
            return await runAgentBrowserCommand(
                {
                    agentId: context.agentId,
                    args: operation.args,
                    browserRoot: input.browserRoot,
                    cwd: context.cwd,
                    signal: context.signal,
                },
                (command) => streamedResult(command, context.logPath)
            );
        } catch (error) {
            const stopped = stoppedOutcome(context.signal);
            if (stopped) {
                return textResult(stopped, '');
            }
            return textResult('failed', error instanceof Error ? error.message : String(error));
        }
    };
    return runner;
}

export async function streamedResult(command: StreamedCommand, logPath: string) {
    const output = new OutputTail(logPath);
    let exitCode: number;
    try {
        exitCode = await streamProcess(command, (data, pipe) => output.append(data, pipe));
    } finally {
        output.finish();
        await output.close();
    }
    const text = formatTail(output, logPath, '');
    const extra = { logPath, truncated: output.snapshot().truncated };
    const stopped = stoppedOutcome(command.signal);
    return stopped
        ? textResult(stopped, text, extra)
        : textResult('completed', text, { ...extra, exitCode });
}
