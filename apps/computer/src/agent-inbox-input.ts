import {
    addressedReasonSchema,
    agentThreadContextSchema,
    chatMessageReplySchema,
    cloudAgentWorkAttentionSchema,
} from '@haus/api';
import type { UnreadElsewhere } from './agent-commands.ts';
import type { AgentCloudAgentWorkAttention, AgentInboxItem } from './agent-inbox-item.ts';

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
    if (
        !(
            isRecord(item) &&
            ['chatId', 'createdAt', 'id', 'senderHandle', 'target'].every(
                (field) => typeof item[field] === 'string' && item[field].length > 0
            ) &&
            typeof item.content === 'string' &&
            (item.addressed === undefined || typeof item.addressed === 'boolean') &&
            (item.addressedReason === undefined ||
                addressedReasonSchema.safeParse(item.addressedReason).success) &&
            (item.senderDescription === undefined || typeof item.senderDescription === 'string') &&
            (item.message === undefined || isRecord(item.message)) &&
            (item.threadFollowReactivated === undefined ||
                typeof item.threadFollowReactivated === 'boolean') &&
            ['agent', 'human', 'system', 'trigger'].includes(item.senderType as string)
        ) ||
        typeof item.sequence !== 'number' ||
        !Number.isInteger(item.sequence) ||
        item.sequence < 0
    ) {
        return null;
    }
    const cloudAgentWork = parseCloudAgentWorkAttention(item.cloudAgentWork);
    const reply = chatMessageReplySchema.nullish().safeParse(item.reply);
    const threadContext = agentThreadContextSchema.optional().safeParse(item.threadContext);
    if (!(reply.success && threadContext.success)) {
        return null;
    }
    if (item.cloudAgentWork !== undefined && !cloudAgentWork) {
        return null;
    }
    if (invalidAttentionIdentity(item, cloudAgentWork)) {
        return null;
    }
    return {
        ...item,
        ...(reply.data !== undefined ? { reply: reply.data } : {}),
        ...(cloudAgentWork ? { cloudAgentWork } : {}),
    } as unknown as AgentInboxItem;
}

function invalidAttentionIdentity(
    item: Record<string, unknown>,
    work: AgentCloudAgentWorkAttention | null | undefined
): boolean {
    if (work) {
        return item.sequence !== 0 || item.id !== work.runId || item.senderType !== 'system';
    }
    return item.sequence === 0;
}

function parseCloudAgentWorkAttention(
    value: unknown
): AgentCloudAgentWorkAttention | undefined | null {
    if (value === undefined) {
        return undefined;
    }
    const parsed = cloudAgentWorkAttentionSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
