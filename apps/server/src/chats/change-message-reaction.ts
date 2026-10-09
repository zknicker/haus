import type { ChatMessageReactionInput, ChatMessageReactionReceipt } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ChatAccessDeniedError, ChatNotFoundError, requireChatWriteAccess } from './chat-access.ts';
import { prepareMessageReactionEvent } from './message-reaction-event.ts';
import { writeMessageReaction } from './message-reactions.ts';
import { readMessagesById } from './read-messages-by-id.ts';

export interface ChangeMessageReactionResult {
    event: PreparedRealtimeEvent | null;
    receipt: ChatMessageReactionReceipt;
}

export async function changeMessageReaction(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatMessageReactionInput
): Promise<ChangeMessageReactionResult> {
    if (!member) {
        throw new ChatAccessDeniedError();
    }

    const event = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);

        const [message] = await tx
            .select({
                chatId: chatMessagesTable.chatId,
                id: chatMessagesTable.id,
                sequence: chatMessagesTable.sequence,
            })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.id, input.messageId)
                )
            )
            .limit(1);
        if (!message) {
            throw new ChatNotFoundError();
        }

        const chat = await requireChatWriteAccess(tx, member, {
            chatId: message.chatId,
            serverId: input.serverId,
        });
        const changed = await writeMessageReaction(tx, {
            actorUserId: member.id,
            emoji: input.emoji,
            messageId: message.id,
            remove: input.remove,
            serverId: input.serverId,
        });

        return changed
            ? prepareMessageReactionEvent({
                  chatId: message.chatId,
                  messageId: message.id,
                  parentChatId: chat.kind === 'thread' ? chat.parentChatId : null,
                  serverId: input.serverId,
              })
            : null;
    });

    const message = (await readMessagesById(db, input.serverId, [input.messageId])).get(
        input.messageId
    );
    if (!message) {
        throw new ChatNotFoundError();
    }

    return {
        event,
        receipt: {
            changed: event !== null,
            message,
        },
    };
}
