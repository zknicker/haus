import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import type { InvocationOperation } from '@haus/api';
import { type OperationContext, type OperationRunner, textResult } from '../operation.ts';
import type { ProcessRecord } from './process-records.ts';

export async function startBackgroundProcess(
    operation: Extract<InvocationOperation, { kind: 'bash' }>,
    context: OperationContext
) {
    try {
        await access(context.cwd, constants.F_OK);
    } catch {
        return textResult('failed', `Working directory does not exist: ${context.cwd}`);
    }
    const started = await context.processes.start({
        agentId: context.agentId,
        command: operation.command,
        cwd: context.cwd,
        env: context.env,
        runId: context.runId,
        sessionGeneration: context.sessionGeneration,
        signal: context.signal,
    });
    if (started.kind === 'stopped') {
        return textResult('cancelled', 'Cancelled before it started.');
    }
    if (started.kind === 'full') {
        return textResult(
            'failed',
            `This Computer already runs ${started.limit} background processes. End one with process_kill first.`
        );
    }
    return textResult(
        'completed',
        `Started background process ${started.processId}. Read its output with process_read from afterSeq 0. A process_exit item wakes you when it ends.`,
        { logPath: started.logPath, truncated: false }
    );
}

export const processReadRunner: OperationRunner<'process-read'> = async (operation, context) => {
    const read = await context.processes.read(
        context.agentId,
        operation.processId,
        operation.afterSeq
    );
    if (!read) {
        return textResult('failed', `You have no background process ${operation.processId} here.`);
    }
    const more = read.nextSeq < read.size;
    const status = `[${operation.processId} ${statusOf(read.record)} · next afterSeq ${read.nextSeq}${more ? ' · more output waits' : ''}]`;
    return textResult('completed', read.text ? `${read.text}\n${status}` : status, {
        truncated: more,
    });
};

export const processKillRunner: OperationRunner<'process-kill'> = async (operation, context) =>
    (await context.processes.kill(context.agentId, operation.processId))
        ? textResult('completed', `Ended ${operation.processId}.`)
        : textResult('failed', `${operation.processId} is not running.`);

function statusOf(record: ProcessRecord) {
    switch (record.ending) {
        case null:
            return 'running';
        case 'exited':
            return `exited with code ${record.exitCode ?? 'unknown'}`;
        case 'lost':
            return 'ended when the Computer restarted';
        default:
            return `was ended (${record.ending})`;
    }
}
