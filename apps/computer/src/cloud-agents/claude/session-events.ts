import type { ClaudeSessionEvent } from './controller.ts';

/**
 * The parts of Claude Code's stream-json log one Run's reading needs. Unknown
 * payloads are skipped rather than rejected: the log carries many UI-only
 * event kinds, and new ones must not break a reading.
 */
export type ClaudeLogEntry =
    | { kind: 'prompt'; id: string; text: string }
    | { kind: 'assistant-text'; text: string }
    | { kind: 'tool-use'; id: string; input: unknown; name: string }
    | { kind: 'tool-result'; toolUseId: string }
    | {
          kind: 'result';
          costUsd: number | null;
          isError: boolean;
          subtype: string;
          text: string | null;
          usage: { input: number; output: number };
      }
    | { kind: 'task'; id: string; terminal: boolean }
    | { kind: 'control-response'; requestId: string; success: boolean };

/** One Run's tag, the first line of every prompt Haus sends. */
export function claudeRunTag(ref: { runId: string; workId: string }): string {
    return `HAUS_CLOUD_RUN=${ref.workId}/${ref.runId}`;
}

/** Whether this event is the prompt Haus sent for the Run. */
export function isRunPrompt(event: ClaudeSessionEvent, tag: string): boolean {
    return logEntriesOf(event).some((entry) => entry.kind === 'prompt' && hasTag(entry.text, tag));
}

export function logEntriesOf(event: ClaudeSessionEvent): ClaudeLogEntry[] {
    const payload = event.payload;
    switch (payload.type) {
        case 'user':
            return userEntries(payload);
        case 'assistant':
            return assistantEntries(payload);
        case 'result':
            return [resultEntry(payload)];
        case 'system':
            return taskEntries(payload);
        case 'control_response':
            return controlEntries(payload);
        default:
            return [];
    }
}

function hasTag(text: string, tag: string): boolean {
    return text.split(/\r?\n/u).some((line) => line.trim() === tag);
}

function userEntries(payload: Record<string, unknown>): ClaudeLogEntry[] {
    const origin = record(payload.origin);
    if (origin?.kind === 'task-notification') {
        return [];
    }
    const content = record(payload.message)?.content;
    if (typeof content === 'string') {
        return typeof payload.uuid === 'string'
            ? [{ id: payload.uuid, kind: 'prompt', text: content }]
            : [];
    }
    const blocks = Array.isArray(content) ? content.map(record) : [];
    const entries: ClaudeLogEntry[] = blocks.flatMap((block) =>
        block?.type === 'tool_result' && typeof block.tool_use_id === 'string'
            ? [{ kind: 'tool-result' as const, toolUseId: block.tool_use_id }]
            : []
    );
    const text = blocks
        .map((block) =>
            block?.type === 'text' && typeof block.text === 'string' ? block.text : ''
        )
        .join('');
    if (text.length > 0 && typeof payload.uuid === 'string') {
        entries.push({ id: payload.uuid, kind: 'prompt', text });
    }
    return entries;
}

function assistantEntries(payload: Record<string, unknown>): ClaudeLogEntry[] {
    const content = record(payload.message)?.content;
    const blocks = Array.isArray(content) ? content.map(record) : [];
    return blocks.flatMap((block): ClaudeLogEntry[] => {
        if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            return [{ kind: 'assistant-text', text: block.text }];
        }
        if (
            block?.type === 'tool_use' &&
            typeof block.id === 'string' &&
            typeof block.name === 'string'
        ) {
            return [{ id: block.id, input: block.input, kind: 'tool-use', name: block.name }];
        }
        return [];
    });
}

function resultEntry(payload: Record<string, unknown>): ClaudeLogEntry {
    const usage = record(payload.usage);
    return {
        costUsd: typeof payload.total_cost_usd === 'number' ? payload.total_cost_usd : null,
        isError: payload.is_error === true,
        kind: 'result',
        subtype: typeof payload.subtype === 'string' ? payload.subtype : 'unknown',
        text: typeof payload.result === 'string' && payload.result.trim() ? payload.result : null,
        usage: { input: count(usage?.input_tokens), output: count(usage?.output_tokens) },
    };
}

function taskEntries(payload: Record<string, unknown>): ClaudeLogEntry[] {
    if (
        !(payload.subtype === 'task_started' || payload.subtype === 'task_notification') ||
        typeof payload.task_id !== 'string'
    ) {
        return [];
    }
    return [
        {
            id: payload.task_id,
            kind: 'task',
            terminal:
                payload.subtype === 'task_notification' &&
                ['stopped', 'completed', 'failed'].includes(String(payload.status)),
        },
    ];
}

function controlEntries(payload: Record<string, unknown>): ClaudeLogEntry[] {
    const response = record(payload.response);
    return typeof response?.request_id === 'string'
        ? [
              {
                  kind: 'control-response',
                  requestId: response.request_id,
                  success: response.subtype === 'success',
              },
          ]
        : [];
}

function record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}
