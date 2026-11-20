import {
    type ComputerExecutionJournal,
    createComputerExecutionJournal,
} from '@haus/computer/src/harness/execution-journal.ts';
import type { ToolResultTurnEvent, TurnEvent } from '../turn/turn-event.ts';
import type { JournalUploads } from './journal-uploads.ts';

const reasoningFlushIntervalMs = 250;

type JournalStatus = 'completed' | 'failed' | 'interrupted';

export type RunJournal = Awaited<ReturnType<typeof openRunJournal>>;

export async function openRunJournal(input: {
    agentDir: string;
    agentId: string;
    runId: string;
    uploads?: JournalUploads;
}) {
    const sink = await input.uploads?.sink({
        agentId: input.agentId,
        agentRoot: input.agentDir,
        runId: input.runId,
    });
    const journal = await createComputerExecutionJournal(
        { agentRoot: input.agentDir, runId: input.runId },
        sink
    );
    const pending = new Set<string>();
    const reasoning = { flushedAt: 0 };
    return {
        async *journaled(events: AsyncIterable<TurnEvent>) {
            for await (const event of events) {
                await record(journal, event, pending, reasoning);
                yield event;
            }
        },
        async close(result: { failure: unknown; status: JournalStatus }) {
            if (pending.size > 0) {
                const interrupted = result.status === 'interrupted';
                await journal.finishPending(
                    interrupted ? 'interrupted' : 'failed',
                    interrupted ? 'stream_abort' : 'stream_error',
                    result.failure ?? undefined
                );
            }
            await journal.flushReasoning();
            await journal.finish(
                result.status,
                result.status === 'failed' ? result.failure : undefined
            );
        },
    };
}

async function record(
    journal: ComputerExecutionJournal,
    event: TurnEvent,
    pending: Set<string>,
    reasoning: { flushedAt: number }
) {
    switch (event.type) {
        case 'tool-call':
            pending.add(event.toolCallId);
            await journal.recordToolCall({
                input: event.input,
                nativeName: event.nativeName,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
            });
            return;
        case 'tool-result':
        case 'tool-error':
            pending.delete(event.toolCallId);
            await journal.recordToolResult({
                isError: event.type === 'tool-error' || event.isError === true,
                nativeName: event.nativeName,
                output: event.type === 'tool-error' ? event.error : resultOutput(event),
                preliminary: false,
                toolCallId: event.toolCallId,
                toolName: event.toolName,
            });
            return;
        case 'reasoning-start':
            journal.recordReasoningStart({ id: event.id });
            return;
        case 'reasoning-delta':
            journal.appendReasoning({ id: event.id, text: event.text });
            if (Date.now() - reasoning.flushedAt >= reasoningFlushIntervalMs) {
                reasoning.flushedAt = Date.now();
                await journal.flushReasoning();
            }
            return;
        case 'reasoning-end':
            if (event.id) {
                await journal.recordReasoningEnd({ id: event.id });
            }
            return;
        default:
            return;
    }
}

function resultOutput(event: ToolResultTurnEvent) {
    return event.invocation && event.invocation !== 'completed'
        ? { invocation: event.invocation, output: event.output }
        : event.output;
}
