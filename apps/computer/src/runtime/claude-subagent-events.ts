import type { SubagentStatus, SubagentTurnEvent, SubagentUsage } from './turn-event.ts';

/**
 * Normalizes one Claude Code stream message about a sub-agent: a `system` `task_*` message, or
 * the sub-agent's own assistant/user message tagged with the delegating call's
 * `parent_tool_use_id`. Claude Code's `--output-format stream-json` and the Agent SDK emit the
 * same messages; the Claude driver's normalizer reads them here.
 */
export function claudeSubagentEvents(message: unknown): SubagentTurnEvent[] {
    if (!isRecord(message)) {
        return [];
    }
    const parent = stringValue(message.parent_tool_use_id);
    if (parent && (message.type === 'assistant' || message.type === 'user')) {
        return childEvents(parent, message);
    }
    return message.type === 'system' ? taskEvents(message) : [];
}

function taskEvents(message: Record<string, unknown>): SubagentTurnEvent[] {
    const taskId = stringValue(message.task_id);
    if (!taskId) {
        return [];
    }
    if (message.subtype === 'task_started') {
        const toolCallId = stringValue(message.tool_use_id);
        // Background shells are tasks too; only a sub-agent belongs to a delegating call.
        if (message.task_type !== 'local_agent' || !toolCallId) {
            return [];
        }
        return [
            {
                taskId,
                toolCallId,
                type: 'subagent-started',
                ...(message.is_backgrounded === true ? { backgrounded: true as const } : {}),
                ...optional('description', text(message.description)),
                ...optional('subagentType', text(message.subagent_type)),
            },
        ];
    }
    if (message.subtype === 'task_progress') {
        return [
            {
                taskId,
                type: 'subagent-progress',
                ...optional('description', text(message.description)),
                ...optional('usage', taskUsage(message.usage)),
            },
        ];
    }
    const patch = isRecord(message.patch) ? message.patch : undefined;
    if (message.subtype === 'task_updated' && patch) {
        return [
            {
                taskId,
                type: 'subagent-status',
                ...optional('status', taskStatus(patch.status)),
                ...optional('endTime', finiteNumber(patch.end_time)),
            },
        ];
    }
    if (message.subtype === 'task_notification') {
        return [
            {
                taskId,
                type: 'subagent-status',
                ...optional('status', taskStatus(message.status)),
                ...optional('usage', taskUsage(message.usage)),
            },
        ];
    }
    return [];
}

function childEvents(
    parentToolCallId: string,
    message: Record<string, unknown>
): SubagentTurnEvent[] {
    const content = isRecord(message.message) ? message.message.content : undefined;
    if (!Array.isArray(content)) {
        return [];
    }
    const events: SubagentTurnEvent[] = [];
    for (const block of content) {
        if (!isRecord(block)) {
            continue;
        }
        const id = stringValue(block.id);
        const name = stringValue(block.name);
        if (block.type === 'tool_use' && id && name) {
            events.push({
                input: block.input,
                parentToolCallId,
                toolCallId: id,
                toolName: name,
                type: 'subagent-tool-call',
            });
            continue;
        }
        const resultId = stringValue(block.tool_use_id);
        if (block.type === 'tool_result' && resultId) {
            events.push({
                isError: block.is_error === true,
                output: block.content,
                parentToolCallId,
                toolCallId: resultId,
                type: 'subagent-tool-result',
            });
        }
    }
    return events;
}

/** Claude Code task states; `killed` and `stopped` are the runtime ending it early. */
const taskStatuses: Readonly<Record<string, SubagentStatus>> = {
    completed: 'completed',
    failed: 'failed',
    killed: 'interrupted',
    pending: 'running',
    running: 'running',
    stopped: 'interrupted',
};

function taskStatus(value: unknown): SubagentStatus | undefined {
    return typeof value === 'string' && Object.hasOwn(taskStatuses, value)
        ? taskStatuses[value]
        : undefined;
}

/** All three counts, or none: a partial usage report is not a usage. */
export function taskUsage(value: unknown): SubagentUsage | undefined {
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

function optional<Key extends string, Value>(
    key: Key,
    value: Value | undefined
): { [K in Key]?: Value } {
    return (value === undefined ? {} : { [key]: value }) as { [K in Key]?: Value };
}

function count(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
        ? value
        : undefined;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
