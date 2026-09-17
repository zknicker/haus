import { parseAgentReferenceTarget, parseHausRichReferences } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMessageFollowsTable,
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';

export async function ensureInlineReplyParticipants(
    db: HausDatabase,
    input: {
        authorAgentId: string | null;
        chatId: string;
        content: string;
        messageId: string;
        serverId: string;
    }
) {
    const [message] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            content: chatMessagesTable.content,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, input.messageId),
                eq(chatMessagesTable.chatId, input.chatId)
            )
        )
        .limit(1);
    if (!message) {
        return null;
    }
    const rootMessageId = message.replyRootMessageId ?? input.messageId;
    const [chat] = await db
        .select({ dmAgentId: chatsTable.dmAgentId, kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat || (chat.kind !== 'channel' && chat.kind !== 'dm')) {
        return null;
    }
    const eligible = await listEligibleAgents(db, {
        chatId: input.chatId,
        serverId: input.serverId,
    });
    if (eligible.length === 0) {
        return rootMessageId;
    }
    const eligibleIds = new Set(eligible.map((agent) => agent.id));
    const [root] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            content: chatMessagesTable.content,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.id, rootMessageId)
            )
        )
        .limit(1);
    if (!root) {
        return rootMessageId;
    }
    const initial = new Set<string>();
    if (root.authorAgentId && eligibleIds.has(root.authorAgentId)) {
        initial.add(root.authorAgentId);
    }
    for (const agentId of mentionedAgentIds(root.content, eligible)) {
        initial.add(agentId);
    }
    for (const agentId of initial) {
        await db
            .insert(agentMessageFollowsTable)
            .values({
                agentId,
                chatId: input.chatId,
                chatKind: chat.kind,
                rootMessageId,
                serverId: input.serverId,
            })
            .onConflictDoNothing();
    }

    const active = new Set<string>();
    if (input.authorAgentId && eligibleIds.has(input.authorAgentId)) {
        active.add(input.authorAgentId);
    }
    for (const agentId of mentionedAgentIds(input.content, eligible)) {
        active.add(agentId);
    }
    for (const agentId of active) {
        await db
            .insert(agentMessageFollowsTable)
            .values({
                agentId,
                chatId: input.chatId,
                chatKind: chat.kind,
                rootMessageId,
                serverId: input.serverId,
            })
            .onConflictDoUpdate({
                set: { followed: true, updatedAt: sql`now()` },
                target: [
                    agentMessageFollowsTable.serverId,
                    agentMessageFollowsTable.chatId,
                    agentMessageFollowsTable.rootMessageId,
                    agentMessageFollowsTable.agentId,
                ],
            });
    }
    return rootMessageId;
}

/** The claim path calls this inside its transaction after the lock succeeds. */
export async function followInlineReplyForMessage(
    db: HausDatabase,
    input: { agentId: string; chatId: string; messageId: string; serverId: string }
) {
    const [message] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            content: chatMessagesTable.content,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!message) {
        return false;
    }
    const [chat] = await db
        .select({ kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat || (chat.kind !== 'channel' && chat.kind !== 'dm')) {
        return false;
    }
    await ensureInlineReplyParticipants(db, {
        // Claiming a later message adds only the claimant. Root inference must
        // preserve any explicit false rows from earlier messages in the chain.
        authorAgentId: null,
        chatId: input.chatId,
        content: '',
        messageId: input.messageId,
        serverId: input.serverId,
    });
    const rootMessageId = message.replyRootMessageId ?? input.messageId;
    await db
        .insert(agentMessageFollowsTable)
        .values({
            agentId: input.agentId,
            chatId: input.chatId,
            chatKind: chat.kind,
            rootMessageId,
            serverId: input.serverId,
        })
        .onConflictDoUpdate({
            set: { followed: true, updatedAt: sql`now()` },
            target: [
                agentMessageFollowsTable.serverId,
                agentMessageFollowsTable.chatId,
                agentMessageFollowsTable.rootMessageId,
                agentMessageFollowsTable.agentId,
            ],
        });
    return message.replyToMessageId !== null;
}

export async function listEligibleAgents(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; serverId: string }
): Promise<Array<{ handle: string; id: string }>> {
    const [chat] = await db
        .select({ dmAgentId: chatsTable.dmAgentId, kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .limit(1);
    if (!chat) {
        return [];
    }
    if (chat.kind === 'dm') {
        if (!chat.dmAgentId) {
            return [];
        }
        return await db
            .select({ handle: agentsTable.handle, id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    eq(agentsTable.id, chat.dmAgentId),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
    }
    if (chat.kind !== 'channel') {
        return [];
    }
    return await db
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(channelAgentParticipantsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, channelAgentParticipantsTable.serverId),
                eq(agentsTable.id, channelAgentParticipantsTable.agentId)
            )
        )
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, input.serverId),
                eq(channelAgentParticipantsTable.chatId, input.chatId),
                isNull(agentsTable.retiredAt)
            )
        );
}

export function mentionedAgentIds(
    content: string,
    agents: Array<{ handle: string; id: string }>
): Set<string> {
    const ids = new Set(
        parseHausRichReferences(content).flatMap((reference) => {
            if (reference.kind !== 'agent') {
                return [];
            }
            const id = parseAgentReferenceTarget(reference.id);
            return id ? [id] : [];
        })
    );
    for (const agent of agents) {
        if (
            new RegExp(`(^|\\s)@${escapeRegex(agent.handle)}(?=$|[\\s.,!?;:])`, 'iu').test(content)
        ) {
            ids.add(agent.id);
        }
    }
    return new Set([...ids].filter((id) => agents.some((agent) => agent.id === id)));
}

function escapeRegex(value: string) {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
