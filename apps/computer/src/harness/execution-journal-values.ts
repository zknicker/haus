import {
    EXECUTION_JOURNAL_VALUE_MAX_CHARS,
    type ExecutionJournalDocument,
    type ExecutionJournalValue,
} from '@haus/api';

/**
 * Clips one string leaf to the journal's per-value ceiling. The suffix keeps the
 * reader honest about what was dropped instead of silently ending mid-output.
 */
export function capJournalString(value: string): string {
    if (value.length <= EXECUTION_JOURNAL_VALUE_MAX_CHARS) {
        return value;
    }
    const dropped = value.length - EXECUTION_JOURNAL_VALUE_MAX_CHARS;
    const kept = value.slice(0, EXECUTION_JOURNAL_VALUE_MAX_CHARS);
    return `${kept}\n…[truncated ${String(dropped)} more characters]`;
}

/**
 * Projects an arbitrary runtime value into the journal's serializable shape,
 * capping every string leaf so a payload shape such as `{ stdout, stderr }`
 * survives with each field clipped rather than the whole value discarded.
 */
export function journalValue(value: unknown, seen = new WeakSet<object>()): ExecutionJournalValue {
    if (value === null || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return capJournalString(value);
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : String(value);
    }
    if (typeof value === 'bigint') {
        return capJournalString(value.toString());
    }
    if (value instanceof Error) {
        return { message: capJournalString(value.message), name: value.name };
    }
    if (typeof value === 'undefined') {
        return null;
    }
    if (typeof value === 'object') {
        if (seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);
        if (Array.isArray(value)) {
            return value.map((item) => journalValue(item, seen));
        }
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, journalValue(item, seen)])
        );
    }
    return capJournalString(String(value));
}

export function isJournalDocument(
    value: unknown,
    runId: string
): value is ExecutionJournalDocument {
    if (
        !isRecord(value) ||
        value.runId !== runId ||
        typeof value.startedAt !== 'string' ||
        !['completed', 'failed', 'interrupted', 'running'].includes(value.status as string) ||
        !Array.isArray(value.tools) ||
        !isReasoningList(value.reasoning)
    ) {
        return false;
    }
    return value.tools.every(
        (tool) =>
            isRecord(tool) &&
            typeof tool.toolCallId === 'string' &&
            typeof tool.toolName === 'string' &&
            typeof tool.startedAt === 'string' &&
            ['completed', 'failed', 'interrupted', 'running'].includes(tool.status as string)
    );
}

/** Journals written before reasoning capture omit the field entirely. */
function isReasoningList(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    return (
        Array.isArray(value) &&
        value.every(
            (block) =>
                isRecord(block) &&
                typeof block.id === 'string' &&
                typeof block.startedAt === 'string' &&
                typeof block.text === 'string'
        )
    );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isMissingFile(error: unknown): boolean {
    return isRecord(error) && error.code === 'ENOENT';
}
