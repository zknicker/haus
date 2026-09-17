import { and, eq, sql } from 'drizzle-orm';
import { AgentTargetError, resolveAgentTarget } from '../agent-api/resolve-target.ts';
import { deleteQueuedInlineReplyItems } from '../agent-delivery/inline-reply-queue.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMessageFollowsTable, chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { messageIdPredicate } from './reply-context.ts';
import { ensureInlineReplyParticipants } from './reply-subscriptions.ts';

export async function setAgentInlineReplyFollow(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { followed: boolean; messageId: string; target: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const chatId = await resolveAgentTarget(tx, runner, input.target);
        const [chat] = await tx
            .select({ kind: chatsTable.kind, name: chatsTable.name })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
            .limit(1);
        if (!chat || (chat.kind !== 'channel' && chat.kind !== 'dm')) {
            throw new AgentTargetError('Inline reply follows require a Channel or DM target.');
        }
        const messages = await tx
            .select({
                id: chatMessagesTable.id,
                replyRootMessageId: chatMessagesTable.replyRootMessageId,
                replyToMessageId: chatMessagesTable.replyToMessageId,
            })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, runner.serverId),
                    eq(chatMessagesTable.chatId, chatId),
                    messageIdPredicate(input.messageId)
                )
            )
            .limit(2);
        if (messages.length === 0) {
            throw new AgentTargetError('That message does not exist in this target.');
        }
        if (messages.length > 1) {
            throw new AgentTargetError('That message id is ambiguous.');
        }
        const [message] = messages;
        const rootMessageId = message.replyRootMessageId ?? message.id;
        await ensureInlineReplyParticipants(tx, {
            authorAgentId: null,
            chatId,
            content: '',
            messageId: message.id,
            serverId: runner.serverId,
        });
        if (!input.followed) {
            await unfollowInlineReply(tx, runner, chatId, rootMessageId);
            return { followed: false, target: input.target };
        }
        await tx
            .insert(agentMessageFollowsTable)
            .values({
                agentId: runner.agentId,
                chatId,
                chatKind: chat.kind,
                rootMessageId,
                serverId: runner.serverId,
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
        return { followed: true, target: input.target };
    });
}

async function unfollowInlineReply(
    db: Pick<HausDatabase, 'select' | 'update' | 'delete'>,
    runner: ResolvedRunner,
    chatId: string,
    rootMessageId: string
) {
    const [existing] = await db
        .select({ agentId: agentMessageFollowsTable.agentId })
        .from(agentMessageFollowsTable)
        .where(
            and(
                eq(agentMessageFollowsTable.serverId, runner.serverId),
                eq(agentMessageFollowsTable.chatId, chatId),
                eq(agentMessageFollowsTable.rootMessageId, rootMessageId),
                eq(agentMessageFollowsTable.agentId, runner.agentId)
            )
        )
        .limit(1);
    if (!existing) {
        return;
    }
    await db
        .update(agentMessageFollowsTable)
        .set({ followed: false, updatedAt: sql`now()` })
        .where(
            and(
                eq(agentMessageFollowsTable.serverId, runner.serverId),
                eq(agentMessageFollowsTable.chatId, chatId),
                eq(agentMessageFollowsTable.rootMessageId, rootMessageId),
                eq(agentMessageFollowsTable.agentId, runner.agentId)
            )
        );
    await deleteQueuedInlineReplyItems(db, {
        agentId: runner.agentId,
        chatId,
        rootMessageId,
        serverId: runner.serverId,
    });
}
