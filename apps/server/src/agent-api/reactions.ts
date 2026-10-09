import { and, eq } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import { prepareMessageReactionEvent } from '../chats/message-reaction-event.ts';
import { writeMessageReaction } from '../chats/message-reactions.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireAgentChatAccess, resolveAgentMessage } from './message-read.ts';

export async function changeAgentReaction(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { emoji: string; messageId: string; remove: boolean }
) {
    const visibleMessage = await resolveAgentMessage(db, runner, input.messageId);
    await requireChatWritable(db, {
        chatId: visibleMessage.chat_id,
        serverId: runner.serverId,
    });
    const event = await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        await requireAgentChatAccess(tx, runner, visibleMessage.chat_id);
        await requireChatWritable(tx, {
            chatId: visibleMessage.chat_id,
            serverId: runner.serverId,
        });
        const changed = await writeMessageReaction(tx, {
            actorAgentId: runner.agentId,
            emoji: input.emoji,
            messageId: visibleMessage.id,
            remove: input.remove,
            serverId: runner.serverId,
        });
        const [chat] = await tx
            .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
            .from(chatsTable)
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.id, visibleMessage.chat_id)
                )
            )
            .limit(1);
        if (!chat) {
            throw new Error('Failed to resolve the Message reaction Chat.');
        }
        return changed
            ? prepareMessageReactionEvent({
                  chatId: visibleMessage.chat_id,
                  messageId: visibleMessage.id,
                  parentChatId: chat.kind === 'thread' ? chat.parentChatId : null,
                  serverId: runner.serverId,
              })
            : null;
    });
    return {
        event,
        message: await resolveAgentMessage(db, runner, visibleMessage.id),
    };
}
