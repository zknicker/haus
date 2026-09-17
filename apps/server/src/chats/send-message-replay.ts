import type { ChatMessageReceipt, ChatSendInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatEventsTable, chatMessagesTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { toChatMessage } from './message-shape.ts';
import { readMessageRelations } from './read-message-relations.ts';

export async function readExistingChatMessage(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    chatId: string,
    nonce: string
) {
    const [existing] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            bodyKind: chatMessagesTable.bodyKind,
            chatId: chatMessagesTable.chatId,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            eventCursor: chatEventsTable.cursor,
            id: chatMessagesTable.id,
            nonce: chatMessagesTable.nonce,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
            runId: chatMessagesTable.runId,
            sequence: chatMessagesTable.sequence,
            serverId: chatMessagesTable.serverId,
            sessionGeneration: chatMessagesTable.sessionGeneration,
        })
        .from(chatMessagesTable)
        .innerJoin(
            chatEventsTable,
            and(
                eq(chatEventsTable.serverId, chatMessagesTable.serverId),
                eq(chatEventsTable.messageId, chatMessagesTable.id),
                eq(chatEventsTable.type, 'message.created')
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                eq(chatMessagesTable.chatId, chatId),
                eq(chatMessagesTable.nonce, nonce)
            )
        )
        .limit(1);
    return existing;
}

type ExistingChatMessage = NonNullable<Awaited<ReturnType<typeof readExistingChatMessage>>>;

export async function replayChatMessage(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser,
    input: ChatSendInput,
    existing: ExistingChatMessage,
    threadChatId: string | null,
    replyParentId: string | null,
    conflict: () => Error
): Promise<{ events: []; receipt: ChatMessageReceipt; wakes: [] }> {
    const existingRelations = await readMessageRelations(db, input.serverId, existing.id);
    if (
        existing.authorUserId !== member.id ||
        existing.content !== input.content ||
        !sameIds(
            existingRelations.attachments.map((attachment) => attachment.id),
            input.attachmentIds
        ) ||
        (existing.replyToMessageId ?? null) !== replyParentId
    ) {
        throw conflict();
    }
    return {
        events: [],
        receipt: {
            eventCursor: existing.eventCursor.toString(),
            idempotent: true,
            message: toChatMessage(existing, existingRelations),
            threadChatId,
        },
        wakes: [],
    };
}

function sameIds(left: string[], right: string[]) {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}
