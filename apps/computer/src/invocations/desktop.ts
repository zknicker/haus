import { type AgentDesktopCommand, runAgentDesktopCommand } from '../desktop/desktop-command.ts';
import { streamedResult } from './browser.ts';
import { type OperationRunner, stoppedOutcome, textResult } from './operation.ts';

export function createDesktopRunner(
    input: Pick<AgentDesktopCommand, 'platform' | 'searchPath'> = {}
) {
    const runner: OperationRunner<'desktop'> = async (operation, context) => {
        try {
            return await runAgentDesktopCommand(
                {
                    ...input,
                    args: operation.args,
                    cwd: context.cwd,
                    invocationId: context.invocationId,
                    logPath: context.logPath,
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
