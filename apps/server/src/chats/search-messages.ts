import { type ChatSearchResult, formatTaskKey } from '@haus/api';
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readMessageCauses } from '../automations/message-cause-read.ts';
import { readMessageDriveCitations } from '../drive/citations.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    serverMembershipsTable,
    taskKeysTable,
    tasksTable,
    usersTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readMessageTaskLinks } from '../tasks/task-reference-links.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readLinkedWorker } from '../workers/linked-worker.ts';
import { requireChatAccess } from './chat-access.ts';
import { visibleChats } from './chat-visibility.ts';
import { readMessageBodies } from './message-bodies.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readStoredAuthorProfile, toChatMessage } from './message-shape.ts';
import { readInlineReplyContexts } from './reply-context.ts';

const parentChatsTable = alias(chatsTable, 'search_parent_chats');

export async function searchChatMessages(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        after?: string;
        authorAgentId?: string;
        authorUserId?: string;
        chatId?: string;
        limit: number;
        query: string;
        serverId: string;
    }
): Promise<ChatSearchResult[]> {
    await requireServerMembership(db, member, input.serverId);

    if (!member) {
        return [];
    }

    if (input.chatId) {
        await requireChatAccess(db, member, {
            chatId: input.chatId,
            serverId: input.serverId,
        });
    }

    const rows = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            bodyKind: chatMessagesTable.bodyKind,
            chatId: chatMessagesTable.chatId,
            chatArchivedAt: chatsTable.archivedAt,
            parentChatArchivedAt: parentChatsTable.archivedAt,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            id: chatMessagesTable.id,
            nonce: chatMessagesTable.nonce,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
            runId: chatMessagesTable.runId,
            sequence: chatMessagesTable.sequence,
            serverId: chatMessagesTable.serverId,
            sessionGeneration: chatMessagesTable.sessionGeneration,
            taskBoardKey: taskKeysTable.key,
            taskNumber: tasksTable.number,
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
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .leftJoin(
            parentChatsTable,
            and(
                eq(parentChatsTable.serverId, chatsTable.serverId),
                eq(parentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .leftJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, chatMessagesTable.serverId),
                eq(tasksTable.chatId, chatMessagesTable.chatId)
            )
        )
        .leftJoin(taskKeysTable, eq(taskKeysTable.id, tasksTable.keyId))
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
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                isNull(chatsTable.deletedAt),
                input.chatId
                    ? or(
                          eq(chatMessagesTable.chatId, input.chatId),
                          eq(chatsTable.parentChatId, input.chatId)
                      )
                    : undefined,
                input.authorAgentId
                    ? eq(chatMessagesTable.authorAgentId, input.authorAgentId)
                    : undefined,
                input.authorUserId
                    ? eq(chatMessagesTable.authorUserId, input.authorUserId)
                    : undefined,
                input.after ? gte(chatMessagesTable.createdAt, new Date(input.after)) : undefined,
                sql`${chatMessagesTable.searchVector}
                    @@ websearch_to_tsquery('simple', ${input.query})`,
                visibleChats(member.id)
            )
        )
        .orderBy(sql`${chatMessagesTable.createdAt} desc`, sql`${chatMessagesTable.id} desc`)
        .limit(input.limit);

    const messageIds = rows.map((message) => message.id);
    const [attachments, causes, bodies, works, images, reactions, replies, taskLinks, citations] =
        await Promise.all([
            readMessageAttachments(db, input.serverId, messageIds),
            readMessageCauses(db, input.serverId, messageIds),
            readMessageBodies(db, input.serverId, messageIds),
            readLinkedWorker(db, input.serverId, messageIds),
            readLinkedImageGenerations(db, input.serverId, messageIds),
            readChatMessageReactions(db, input.serverId, messageIds),
            readInlineReplyContexts(db, input.serverId, rows),
            readMessageTaskLinks(db, input.serverId, messageIds),
            readMessageDriveCitations(db, input.serverId, messageIds),
        ]);

    return rows.map((message) => ({
        ...toChatMessage(message, {
            attachments: attachments.get(message.id) ?? [],
            authorProfile: readStoredAuthorProfile(message),
            body: bodies.get(message.id),
            cause: causes.get(message.id),
            workers: works.get(message.id),
            driveCitations: citations.get(message.id),
            imageGenerations: images.get(message.id),
            reactions: reactions.get(message.id),
            reply: replies.get(message.id) ?? null,
            taskLinks: taskLinks.get(message.id),
        }),
        chatArchivedAt:
            (message.parentChatArchivedAt ?? message.chatArchivedAt)?.toISOString() ?? null,
        taskKey:
            message.taskBoardKey !== null && message.taskNumber !== null
                ? formatTaskKey(message.taskBoardKey, message.taskNumber)
                : null,
    }));
}
