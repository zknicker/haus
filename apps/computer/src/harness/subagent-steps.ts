import { createHash } from 'node:crypto';
import { EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS } from '@haus/api';
import type {
    ComputerExecutionJournal,
    ComputerExecutionJournalStatus,
    ComputerExecutionJournalSubagent,
    ComputerExecutionJournalSubagentPatch,
} from './execution-journal.ts';

/**
 * Claude Code runs a sub-agent inside its `Agent` tool call and reports it only
 * through raw SDK messages: `task_*` system messages about the sub-agent, and
 * the sub-agent's own assistant/user messages tagged with the parent call's
 * `parent_tool_use_id`. The harness translates none of them into stream parts.
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
        async observeRaw(part: Record<string, unknown>) {
            const message = isRecord(part.rawValue) ? part.rawValue : undefined;
            if (!(message && journal)) {
                return;
            }
            const parent = stringValue(message.parent_tool_use_id);
            if (parent && (message.type === 'assistant' || message.type === 'user')) {
                await recordChildBlocks(journal, children, parent, message);
                return;
            }
            if (message.type === 'system') {
                await recordTaskMessage(journal, tasks, message);
            }
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

async function recordTaskMessage(
    journal: ComputerExecutionJournal,
    tasks: Map<string, string>,
    message: Record<string, unknown>
) {
    const taskId = stringValue(message.task_id);
    if (!taskId) {
        return;
    }
    if (message.subtype === 'task_started') {
        const toolCallId = stringValue(message.tool_use_id);
        // Background shells are tasks too; only a sub-agent belongs to a delegating call.
        if (message.task_type !== 'local_agent' || !toolCallId) {
            return;
        }
        tasks.set(taskId, toolCallId);
        const description = label(message.description);
        const subagentType = label(message.subagent_type);
        // A finished task may be revived under the same id; it runs again.
        await record(journal, toolCallId, {
            endedAt: null,
            status: 'running',
            ...(description ? { label: description } : {}),
            ...(subagentType ? { subagentType } : {}),
        });
        return;
    }
    const toolCallId = tasks.get(taskId);
    if (!toolCallId) {
        return;
    }
    if (message.subtype === 'task_progress') {
        const latestAction = label(message.description);
        const usage = taskUsage(message.usage);
        await record(journal, toolCallId, {
            ...(latestAction ? { latestAction } : {}),
            ...(usage ? { usage } : {}),
        });
        return;
    }
    const patch = isRecord(message.patch) ? message.patch : undefined;
    if (message.subtype === 'task_updated' && patch) {
        await recordStatus(journal, toolCallId, patch.status, patch.end_time);
        return;
    }
    if (message.subtype === 'task_notification') {
        const usage = taskUsage(message.usage);
        if (usage) {
            await record(journal, toolCallId, { usage });
        }
        await recordStatus(journal, toolCallId, message.status, undefined);
    }
}

async function recordStatus(
    journal: ComputerExecutionJournal,
    toolCallId: string,
    reported: unknown,
    endTime: unknown
) {
    const status = typeof reported === 'string' ? taskStatuses[reported] : undefined;
    if (!status) {
        return;
    }
    const endedAt =
        status === 'running'
            ? null
            : typeof endTime === 'number' && Number.isFinite(endTime)
              ? new Date(endTime).toISOString()
              : undefined;
    await record(journal, toolCallId, {
        status,
        ...(endedAt === undefined ? {} : { endedAt }),
    });
}

async function recordChildBlocks(
    journal: ComputerExecutionJournal,
    children: Map<string, string>,
    parentToolCallId: string,
    message: Record<string, unknown>
) {
    const content = isRecord(message.message) ? message.message.content : undefined;
    if (!Array.isArray(content)) {
        return;
    }
    for (const block of content) {
        if (!isRecord(block)) {
            continue;
        }
        const id = stringValue(block.id);
        const name = stringValue(block.name);
        if (block.type === 'tool_use' && id && name) {
            children.set(id, name);
            await journal.recordToolCall({
                input: block.input,
                nativeName: name,
                parentToolCallId,
                toolCallId: id,
                toolName: name,
            });
            continue;
        }
        const resultId = stringValue(block.tool_use_id);
        if (block.type === 'tool_result' && resultId) {
            await journal.recordToolResult({
                isError: block.is_error === true,
                nativeName: children.get(resultId),
                output: block.content,
                preliminary: false,
                toolCallId: resultId,
                toolName: children.get(resultId) ?? 'tool',
            });
        }
    }
}

function record(
    journal: ComputerExecutionJournal,
    toolCallId: string,
    patch: ComputerExecutionJournalSubagentPatch
) {
    return Object.keys(patch).length > 0
        ? journal.recordSubagent({ patch, toolCallId })
        : Promise.resolve();
}

/** Claude Code task states; `killed` and `stopped` are the runtime ending it early. */
const taskStatuses: Record<string, ComputerExecutionJournalStatus> = {
    completed: 'completed',
    failed: 'failed',
    killed: 'interrupted',
    pending: 'running',
    running: 'running',
    stopped: 'interrupted',
};

function taskUsage(value: unknown): ComputerExecutionJournalSubagent['usage'] {
    if (!isRecord(value)) {
        return;
    }
    const [totalTokens, toolUses, durationMs] = [
        value.total_tokens,
        value.tool_uses,
        value.duration_ms,
    ].map(count);
    return totalTokens === undefined || toolUses === undefined || durationMs === undefined
        ? undefined
        : { durationMs, toolUses, totalTokens };
}

function resultUsage(output: unknown): ComputerExecutionJournalSubagent['usage'] {
    if (!isRecord(output)) {
        return;
    }
    return taskUsage({
        duration_ms: output.totalDurationMs,
        tool_uses: output.totalToolUseCount,
        total_tokens: output.totalTokens,
    });
}

function count(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

function label(value: unknown): string | undefined {
    const text = typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
    return text ? text.slice(0, EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
