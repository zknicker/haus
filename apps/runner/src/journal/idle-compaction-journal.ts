import { compactionToolName } from '../turn/turn-event.ts';
import { createComputerExecutionJournal } from './execution-journal/execution-journal.ts';
import type { JournalUploads } from './journal-uploads.ts';

export async function journalIdleCompaction(input: {
    agentDir: string;
    agentId: string;
    compactionId: string;
    result: {
        summary: string | null;
        tokensAfter: number | null;
        tokensBefore: number | null;
    };
    uploads?: JournalUploads;
}) {
    const { result } = input;
    const sink = await input.uploads?.sink({
        agentId: input.agentId,
        agentRoot: input.agentDir,
        runId: input.compactionId,
    });
    const journal = await createComputerExecutionJournal(
        { agentRoot: input.agentDir, runId: input.compactionId },
        sink
    );
    const toolCallId = `claude-compaction-${crypto.randomUUID()}`;
    await journal.recordToolCall({ input: {}, toolCallId, toolName: compactionToolName });
    await journal.recordToolResult({
        isError: false,
        output: {
            trigger: 'idle',
            ...(result.tokensBefore === null ? {} : { tokensBefore: result.tokensBefore }),
            ...(result.tokensAfter === null ? {} : { tokensAfter: result.tokensAfter }),
            ...(result.summary === null ? {} : { summary: result.summary }),
        },
        preliminary: false,
        toolCallId,
        toolName: compactionToolName,
    });
    await journal.finish('completed');
}
