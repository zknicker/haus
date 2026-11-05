import type { ChatSearchResult } from '@haus/api';
import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readMessageCauses } from '../automations/message-cause-read.ts';
import { readLinkedCloudAgentWork } from '../cloud-agents/linked-cloud-agent-work.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
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
            chatAnchorMessageId: chatsTable.anchorMessageId,
            chatArchivedAt: chatsTable.archivedAt,
            chatKind: chatsTable.kind,
            chatParentChatId: chatsTable.parentChatId,
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
                // A Chat's Threads are part of it, so a Chat filter keeps them.
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
    const [attachments, causes, bodies, works, images, reactions, replies] = await Promise.all([
        readMessageAttachments(db, input.serverId, messageIds),
        readMessageCauses(db, input.serverId, messageIds),
        readMessageBodies(db, input.serverId, messageIds),
        readLinkedCloudAgentWork(db, input.serverId, messageIds),
        readLinkedImageGenerations(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        readInlineReplyContexts(db, input.serverId, rows),
    ]);

    return rows.map((message) => ({
        ...toChatMessage(message, {
            attachments: attachments.get(message.id) ?? [],
            authorProfile: readStoredAuthorProfile(message),
            body: bodies.get(message.id),
            cause: causes.get(message.id),
            cloudAgentWork: works.get(message.id),
            imageGenerations: images.get(message.id),
            reactions: reactions.get(message.id),
            reply: replies.get(message.id) ?? null,
        }),
        chatArchivedAt:
            (message.parentChatArchivedAt ?? message.chatArchivedAt)?.toISOString() ?? null,
        thread: searchResultThread(message),
    }));
}

function searchResultThread(message: {
    chatAnchorMessageId: string | null;
    chatKind: string;
    chatParentChatId: string | null;
    id: string;
}): ChatSearchResult['thread'] {
    if (message.chatKind !== 'thread') {
        return null;
    }
    if (!(message.chatAnchorMessageId && message.chatParentChatId)) {
        throw new Error(`Thread Message ${message.id} has no parent Chat or anchor.`);
    }
    return {
        anchorMessageId: message.chatAnchorMessageId,
        parentChatId: message.chatParentChatId,
    };
}
