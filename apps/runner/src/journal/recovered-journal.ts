import { dispatchIdOf } from '@haus/api';
import {
    createComputerExecutionJournal,
    readComputerExecutionJournal,
} from '@haus/computer/src/harness/execution-journal.ts';
import type { RecoveredDispatch } from '../dispatch/ledger.ts';
import { RunnerCrashedError } from '../turn/turn-failure.ts';
import type { JournalUploads } from './journal-uploads.ts';

export const unknownDispatchMessage =
    'The runner restarted before this call answered. It may or may not have run, and it is never sent again.';

export async function settleRecoveredJournal(input: {
    agentDir: string;
    agentId: string;
    dispatches: readonly RecoveredDispatch[];
    runId: string;
    uploads?: JournalUploads;
}) {
    const before = await readComputerExecutionJournal(input.agentDir, input.runId);
    const settledStatus = before && before.status !== 'running' ? before.status : null;
    if (settledStatus && input.dispatches.length === 0) {
        return;
    }
    const sink = await input.uploads?.sink({
        agentId: input.agentId,
        agentRoot: input.agentDir,
        runId: input.runId,
    });
    const journal = await createComputerExecutionJournal(
        { agentRoot: input.agentDir, runId: input.runId },
        sink
    );
    for (const [toolCallId, dispatches] of byToolCall(input.dispatches)) {
        await journal.recordToolResult({
            isError: true,
            output: {
                dispatches: dispatches.map((dispatch) => dispatchIdOf(dispatch.key)),
                message: unknownDispatchMessage,
                outcome: 'unknown',
            },
            preliminary: false,
            toolCallId,
            toolName:
                before?.tools.find((tool) => tool.toolCallId === toolCallId)?.toolName ??
                dispatches[0]?.kind ??
                'dispatch',
        });
    }
    await journal.finish(
        settledStatus ?? 'failed',
        settledStatus ? before?.error : new RunnerCrashedError()
    );
}

function byToolCall(dispatches: readonly RecoveredDispatch[]) {
    const grouped = new Map<string, RecoveredDispatch[]>();
    for (const dispatch of dispatches) {
        grouped.set(dispatch.key.toolCallId, [
            ...(grouped.get(dispatch.key.toolCallId) ?? []),
            dispatch,
        ]);
    }
    return grouped;
}
