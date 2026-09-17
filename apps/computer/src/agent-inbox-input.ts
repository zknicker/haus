import { chatMessageReplySchema, cloudAgentWorkAttentionSchema } from '@haus/api';
import type { AgentCloudAgentWorkAttention, AgentInboxItem } from './agent-inbox-item.ts';

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
    if (!reply.success) {
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
