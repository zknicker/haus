import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';

export class ReminderAnchorAccessError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReminderAnchorAccessError';
    }
}

export interface AgentAnchorInput {
    agentId: string;
    anchorChatId: string;
    anchorMessageId: string | null;
    serverId: string;
}

/**
 * The Agent can still reach where its automation lands. `anchorMessageId` is
 * null when the anchor is the Chat itself — a human wires a Trigger from the
 * Automations drawer with no asking message to point at — and then Chat access
 * is the whole check.
 */
export async function requireAgentAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: AgentAnchorInput
) {
    const access = await readAgentAnchorAccess(db, input);
    if (access.kind === 'missing') {
        throw new ReminderAnchorAccessError('The reminder anchor is not a message in this Server.');
    }
    if (access.kind === 'denied') {
        throw new ReminderAnchorAccessError('The reminder author cannot access the anchor Chat.');
    }
    return access.anchor;
}

/**
 * Soft read of whether the Agent can still reach a reminder or Trigger anchor.
 * List and log use this per reminder so one left Chat cannot fail the whole
 * command; schedule, update, and snooze keep calling `requireAgentAnchor`.
 */
export async function agentCanAccessAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: AgentAnchorInput
): Promise<boolean> {
    return (await readAgentAnchorAccess(db, input)).kind === 'ok';
}

async function readAgentAnchorAccess(db: Pick<HausDatabase, 'select'>, input: AgentAnchorInput) {
    const anchor = input.anchorMessageId
        ? await readMessageAnchor(db, { ...input, anchorMessageId: input.anchorMessageId })
        : await readChatAnchor(db, input);
    const accessChatId = anchor?.chatKind === 'thread' ? anchor.parentChatId : input.anchorChatId;
    if (!(anchor && accessChatId)) {
        return { kind: 'missing' as const };
    }
    if (anchor.chatKind === 'dm' && anchor.dmAgentId === input.agentId) {
        return { kind: 'ok' as const, anchor };
    }
    const [access] = await db
        .select({ agentId: channelAgentParticipantsTable.agentId })
        .from(channelAgentParticipantsTable)
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, input.serverId),
                eq(channelAgentParticipantsTable.chatId, accessChatId),
                eq(channelAgentParticipantsTable.agentId, input.agentId)
            )
        )
        .limit(1);
    if (!access) {
        return { kind: 'denied' as const };
    }
    return { kind: 'ok' as const, anchor };
}

async function readMessageAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: { anchorChatId: string; anchorMessageId: string; serverId: string }
) {
    const [anchor] = await db
        .select({
            chatKind: chatsTable.kind,
            dmAgentId: chatsTable.dmAgentId,
            messageId: chatMessagesTable.id,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatMessagesTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.anchorChatId),
                eq(chatMessagesTable.id, input.anchorMessageId)
            )
        )
        .limit(1);
    return anchor ?? null;
}

async function readChatAnchor(
    db: Pick<HausDatabase, 'select'>,
    input: { anchorChatId: string; serverId: string }
) {
    const [anchor] = await db
        .select({
            chatKind: chatsTable.kind,
            dmAgentId: chatsTable.dmAgentId,
            messageId: chatsTable.id,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.anchorChatId)))
        .limit(1);
    return anchor ?? null;
}
