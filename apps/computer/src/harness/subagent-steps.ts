import { createHash } from 'node:crypto';
import {
    EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS,
    type ExecutionJournalSubagent,
    type ExecutionJournalSubagentPatch,
} from '@haus/api';
import { taskUsage } from '../runtime/claude-subagent-events.ts';
import type { SubagentStatus, SubagentTurnEvent } from '../runtime/turn-event.ts';
import type { ComputerExecutionJournal } from './execution-journal.ts';

/**
 * Claude Code runs a sub-agent inside its `Agent` tool call and reports it only through its own
 * stream messages, which the driver normalizes into `subagent-*` turn events: the task's
 * lifecycle, and the sub-agent's own calls tagged with the delegating call's id.
 *
 * Everything here is Computer-local journal evidence. A sub-agent's tool calls
 * never open durable activity and never feed thoughts; the parent call alone
 * carries the semantic `delegating` operation.
 */
export function createSubagentSteps(journal: ComputerExecutionJournal | undefined) {
    /** task_id → the delegating tool call it runs under. */
    const tasks = new Map<string, string>();
    /** A sub-agent's tool call id → its tool name, for the result that settles it. */
    const children = new Map<string, string>();
    return {
        clear() {
            tasks.clear();
            children.clear();
        },
        /** Whether a tool call belongs to a sub-agent rather than the Agent itself. */
        isChild(toolCallId: string): boolean {
            return children.has(toolCallId);
        },
        async observe(event: SubagentTurnEvent) {
            if (!journal) {
                return;
            }
            if (event.type === 'subagent-tool-call') {
                children.set(event.toolCallId, event.toolName);
                await journal.recordToolCall({
                    input: event.input,
                    nativeName: event.toolName,
                    parentToolCallId: event.parentToolCallId,
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                });
                return;
            }
            if (event.type === 'subagent-tool-result') {
                await journal.recordToolResult({
                    isError: event.isError,
                    nativeName: children.get(event.toolCallId),
                    output: event.output,
                    preliminary: false,
                    toolCallId: event.toolCallId,
                    toolName: children.get(event.toolCallId) ?? 'tool',
                });
                return;
            }
            await recordTaskEvent(journal, tasks, event);
        },
        /** The delegating call's own result carries the sub-agent's final totals. */
        async observeResult(toolCallId: string, output: unknown) {
            const usage = resultUsage(output);
            if (journal && usage) {
                await journal.recordSubagent({ patch: { usage }, toolCallId });
            }
        },
    };
}

/** The opaque id that pairs a delegating operation's start with its settlement. */
export function delegationOperationId(toolCallId: string): string {
    return createHash('sha256').update(toolCallId).digest('hex').slice(0, 32);
}

async function recordTaskEvent(
    journal: ComputerExecutionJournal,
    tasks: Map<string, string>,
    event: Extract<
        SubagentTurnEvent,
        { type: 'subagent-progress' | 'subagent-started' | 'subagent-status' }
    >
) {
    if (event.type === 'subagent-started') {
        tasks.set(event.taskId, event.toolCallId);
        const description = label(event.description);
        const subagentType = label(event.subagentType);
        // A finished task may be revived under the same id; it runs again.
        await record(journal, event.toolCallId, {
            endedAt: null,
            status: 'running',
            ...(description ? { label: description } : {}),
            ...(subagentType ? { subagentType } : {}),
        });
        return;
    }
    const toolCallId = tasks.get(event.taskId);
    if (!toolCallId) {
        return;
    }
    if (event.type === 'subagent-progress') {
        const latestAction = label(event.description);
        await record(journal, toolCallId, {
            ...(latestAction ? { latestAction } : {}),
            ...(event.usage ? { usage: event.usage } : {}),
        });
        return;
    }
    if (event.usage) {
        await record(journal, toolCallId, { usage: event.usage });
    }
    await recordStatus(journal, toolCallId, event.status, event.endTime);
}

async function recordStatus(
    journal: ComputerExecutionJournal,
    toolCallId: string,
    status: SubagentStatus | undefined,
    endTime: number | undefined
) {
    if (!status) {
        return;
    }
    const endedAt =
        status === 'running'
            ? null
            : endTime === undefined
              ? undefined
              : new Date(endTime).toISOString();
    await record(journal, toolCallId, {
        status,
        ...(endedAt === undefined ? {} : { endedAt }),
    });
}

function record(
    journal: ComputerExecutionJournal,
    toolCallId: string,
    patch: ExecutionJournalSubagentPatch
) {
    return Object.keys(patch).length > 0
        ? journal.recordSubagent({ patch, toolCallId })
        : Promise.resolve();
}

function resultUsage(output: unknown): ExecutionJournalSubagent['usage'] {
    if (!isRecord(output)) {
        return;
    }
    return taskUsage({
        duration_ms: output.totalDurationMs,
        tool_uses: output.totalToolUseCount,
        total_tokens: output.totalTokens,
    });
}

function label(value: string | undefined): string | undefined {
    const text = value?.replace(/\s+/gu, ' ').trim() ?? '';
    return text ? text.slice(0, EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
