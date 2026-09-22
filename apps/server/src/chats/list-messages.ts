import type { ChatMessage, ChatMessagesInput } from '@haus/api';
import { eq, or, type SQL } from 'drizzle-orm';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readMessageCauses } from '../automations/message-cause-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { listMessageTaskMap } from '../tasks/task-shape.ts';
import { listThreadSummaries } from '../threads/list-thread-summaries.ts';
import { requireThreadAccess } from '../threads/resolve-thread-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ChatNotFoundError, requireChatAccess } from './chat-access.ts';
import { readMessageBodies } from './message-bodies.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readStoredAuthorProfile, toChatMessage } from './message-shape.ts';
import { readInlineReplyContexts, resolveInlineReplyParent } from './reply-context.ts';
import { ChatMessageNotFoundError, selectMessagePage } from './select-message-page.ts';

async function buildMessagePredicates(db: HausDatabase, input: ChatMessagesInput) {
    const predicates: SQL<unknown>[] = [
        eq(chatMessagesTable.serverId, input.serverId),
        eq(chatMessagesTable.chatId, input.chatId),
    ];

    if (input.replyRootMessageId) {
        const { root } = await resolveInlineReplyParent(db, {
            chatId: input.chatId,
            replyToMessageId: input.replyRootMessageId,
            serverId: input.serverId,
        });
        const inChain = or(
            eq(chatMessagesTable.id, root.id),
            eq(chatMessagesTable.replyRootMessageId, root.id)
        );
        if (inChain) {
            predicates.push(inChain);
        }
    }

    return predicates;
}

export async function listChatMessages(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatMessagesInput
): Promise<{
    messages: ChatMessage[];
    nextAfterSequence: number | null;
    nextBeforeSequence: number | null;
    threads: Awaited<ReturnType<typeof listThreadSummaries>>;
}> {
    try {
        await requireChatAccess(db, member, input);
    } catch (cause) {
        if (!(cause instanceof ChatNotFoundError)) {
            throw cause;
        }
        // A task Thread nobody has replied in has no Chat row yet. It is still
        // addressable by its derived id, and it reads as what it is: empty.
        await requireThreadAccess(db, member, {
            serverId: input.serverId,
            threadChatId: input.chatId,
        });
        if (input.aroundMessageId !== undefined) {
            throw new ChatMessageNotFoundError();
        }
        return { messages: [], nextAfterSequence: null, nextBeforeSequence: null, threads: [] };
    }

    const predicates = await buildMessagePredicates(db, input);
    const {
        messages: messageRows,
        nextAfterSequence,
        nextBeforeSequence,
    } = await selectMessagePage(db, predicates, input);

    const messageIds = messageRows.map((message) => message.id);
    const [
        attachmentsByMessageId,
        taskByMessageId,
        causeByMessageId,
        bodyByMessageId,
        reactionsByMessageId,
        replyByMessageId,
    ] = await Promise.all([
        readMessageAttachments(db, input.serverId, messageIds),
        listMessageTaskMap(db, input.serverId, messageIds),
        readMessageCauses(db, input.serverId, messageIds),
        readMessageBodies(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        readInlineReplyContexts(db, input.serverId, messageRows),
    ]);
    const messages = messageRows.map((message) => ({
        ...toChatMessage(message, {
            attachments: attachmentsByMessageId.get(message.id) ?? [],
            authorProfile: readStoredAuthorProfile(message),
            body: bodyByMessageId.get(message.id),
            cause: causeByMessageId.get(message.id),
            reactions: reactionsByMessageId.get(message.id),
            reply: replyByMessageId.get(message.id) ?? null,
        }),
        task: taskByMessageId.get(message.id) ?? null,
    }));

    return {
        messages,
        nextAfterSequence,
        nextBeforeSequence,
        threads: await listThreadSummaries(db, member, {
            anchorMessageIds: messages.map((message) => message.id),
            parentChatId: input.chatId,
            serverId: input.serverId,
        }),
    };
}
