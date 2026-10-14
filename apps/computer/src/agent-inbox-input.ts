import { agentInboxItemSchema } from '@haus/api';
import type { UnreadElsewhere } from './agent-commands.ts';
import type { AgentInboxItem } from './agent-inbox-item.ts';

/**
 * Inbox identities the Server marked drainable for this run. An older Server
 * omits them, which reads as "nothing extra is drainable" and preserves the
 * notice-only lane.
 */
export function parseDrainItemIds(value: unknown): string[] | null {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.length > 100) {
        return null;
    }
    return value.every((id) => typeof id === 'string' && id.length > 0)
        ? (value as string[])
        : null;
}

/** Per-chat counts for work this frame does not carry. Fails closed to null. */
export function parseUnreadElsewhere(value: unknown): UnreadElsewhere[] | null {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.length > 50) {
        return null;
    }
    const entries: UnreadElsewhere[] = [];
    for (const entry of value) {
        if (
            !(
                isRecord(entry) &&
                typeof entry.target === 'string' &&
                entry.target.length > 0 &&
                typeof entry.count === 'number' &&
                Number.isInteger(entry.count) &&
                entry.count > 0
            )
        ) {
            return null;
        }
        entries.push({ count: entry.count, target: entry.target });
    }
    return entries;
}

export function parseInbox(value: unknown): AgentInboxItem[] | null {
    if (!Array.isArray(value) || value.length > 100) {
        return null;
    }
    const inbox: AgentInboxItem[] = [];
    for (const valueItem of value) {
        const item = parseInboxItem(valueItem);
        if (!item) {
            return null;
        }
        inbox.push(item);
    }
    return inbox;
}

function parseInboxItem(item: unknown): AgentInboxItem | null {
    const parsed = agentInboxItemSchema.safeParse(item);
    return parsed.success ? parsed.data : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
