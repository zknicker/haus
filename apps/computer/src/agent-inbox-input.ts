import { addressedReasonSchema, humanTimezoneSchema } from '@haus/api';

import type { UnreadElsewhere } from './agent-commands.ts';
import {
    cloudAgentWorkAttentionResponseSchema,
    pullRequestChangeResponseSchema,
} from './agent-inbox-attention-response-schema.ts';
import type { AgentCloudAgentWorkAttention, AgentInboxItem } from './agent-inbox-item.ts';
import { chatMessageReplyResponseSchema } from './chat-message-reply-response-schema.ts';

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

/** The items in a rejected frame that named themselves, so Server can leave them out. */
export function rejectedInboxItems(value: unknown): { id: string; reason: string }[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((item) =>
        !parseInboxItem(item) && isRecord(item) && typeof item.id === 'string' && item.id.length > 0
            ? [{ id: item.id, reason: 'The Computer could not read this inbox item.' }]
            : []
    );
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
            (item.senderTimezone === undefined ||
                (item.senderType === 'human' &&
                    humanTimezoneSchema.safeParse(item.senderTimezone).success)) &&
            (item.message === undefined || isRecord(item.message)) &&
            ['agent', 'human', 'system', 'trigger'].includes(item.senderType as string)
        ) ||
        typeof item.sequence !== 'number' ||
        !Number.isInteger(item.sequence) ||
        item.sequence < 0
    ) {
        return null;
    }
    const attention = parseTypedAttention(item);
    const reply = chatMessageReplyResponseSchema.nullish().safeParse(item.reply);
    if (!(attention && reply.success)) {
        return null;
    }
    return {
        ...item,
        ...(reply.data !== undefined ? { reply: reply.data } : {}),
        ...attention,
    } as unknown as AgentInboxItem;
}

type TypedAttention = Pick<AgentInboxItem, 'cloudAgentWork' | 'pullRequestNotice'>;

function parseTypedAttention(item: Record<string, unknown>): TypedAttention | null {
    const work = cloudAgentWorkAttentionResponseSchema.optional().safeParse(item.cloudAgentWork);
    const notice = pullRequestChangeResponseSchema.optional().safeParse(item.pullRequestNotice);
    if (!(work.success && notice.success) || (work.data && notice.data)) {
        return null;
    }
    const isAttention = Boolean(work.data || notice.data);
    const identityValid = isAttention
        ? item.sequence === 0 && item.senderType === 'system'
        : item.sequence !== 0;
    if (!identityValid) {
        return null;
    }
    return {
        ...(work.data ? { cloudAgentWork: work.data as AgentCloudAgentWorkAttention } : {}),
        ...(notice.data ? { pullRequestNotice: notice.data } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
