import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { runAgentBrowserCommand } from '../browser/agent-command.ts';
import { type OperationRunner, stoppedOutcome, textResult } from './operation.ts';
import { tailNotice } from './pi/tail-notice.ts';
import { truncateTail } from './pi/truncate.ts';

export function createBrowserRunner(input: { browserRoot: string }) {
    const runner: OperationRunner<'browser'> = async (operation, context) => {
        try {
            const result = await runAgentBrowserCommand({
                agentId: context.agentId,
                args: operation.args,
                browserRoot: input.browserRoot,
                cwd: context.cwd,
                signal: context.signal,
            });
            const text =
                result.exitCode === 0
                    ? result.stdout
                    : [result.stdout, result.stderr].filter(Boolean).join('\n');
            return await cappedResult(text, result.exitCode, context.logPath);
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

async function cappedResult(text: string, exitCode: number, logPath: string) {
    const truncation = truncateTail(text);
    if (!truncation.truncated) {
        return textResult('completed', text, { exitCode, truncated: false });
    }
    await mkdir(dirname(logPath), { recursive: true });
    await writeFile(logPath, text);
    const lastLineBytes = Buffer.byteLength(text.slice(text.lastIndexOf('\n') + 1));
    return textResult(
        'completed',
        `${truncation.content}\n\n${tailNotice(truncation, logPath, lastLineBytes)}`,
        { exitCode, logPath, truncated: true }
    );
}
