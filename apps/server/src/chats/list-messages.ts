import type { ChatMessage } from '@haus/api';
import { and, desc, eq, getTableColumns, lt, or } from 'drizzle-orm';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readMessageCauses } from '../automations/message-cause-read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';
import { listMessageTaskMap } from '../tasks/task-shape.ts';
import { listThreadSummaries } from '../threads/list-thread-summaries.ts';
import { requireThreadAccess } from '../threads/resolve-thread-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ChatNotFoundError, requireChatAccess } from './chat-access.ts';
import { readMessageBodies } from './message-bodies.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readStoredAuthorProfile, toChatMessage } from './message-shape.ts';
import { readInlineReplyContexts, resolveInlineReplyParent } from './reply-context.ts';

export async function listChatMessages(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        beforeSequence?: number;
        chatId: string;
        limit: number;
        replyRootMessageId?: string;
        serverId: string;
    }
): Promise<{
    messages: ChatMessage[];
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
        return { messages: [], nextBeforeSequence: null, threads: [] };
    }

    const predicates = [
        eq(chatMessagesTable.serverId, input.serverId),
        eq(chatMessagesTable.chatId, input.chatId),
    ];

    if (input.beforeSequence !== undefined) {
        predicates.push(lt(chatMessagesTable.sequence, input.beforeSequence));
    }
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

    const newestFirst = await db
        .select({
            ...getTableColumns(chatMessagesTable),
            authorAgentAvatarId: agentsTable.avatarId,
            authorAgentDescription: agentsTable.description,
            authorAgentDisplayName: agentsTable.displayName,
            authorAgentRetiredAt: agentsTable.retiredAt,
            authorUserAvatarId: usersTable.avatarId,
            authorUserDescription: usersTable.description,
            authorUserDisplayName: usersTable.displayName,
            authorUserRevokedAt: serverMembershipsTable.revokedAt,
        })
        .from(chatMessagesTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(usersTable, eq(usersTable.id, chatMessagesTable.authorUserId))
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, chatMessagesTable.serverId),
                eq(serverMembershipsTable.userId, chatMessagesTable.authorUserId)
            )
        )
        .where(and(...predicates))
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(input.limit + 1);
    const hasOlderMessages = newestFirst.length > input.limit;
    const messageRows = newestFirst.slice(0, input.limit).reverse();
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
        nextBeforeSequence: hasOlderMessages ? (messages[0]?.sequence ?? null) : null,
        threads: await listThreadSummaries(db, member, {
            anchorMessageIds: messages.map((message) => message.id),
            parentChatId: input.chatId,
            serverId: input.serverId,
        }),
    };
}
