import type { ChatLastMessage } from '@haus/api';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatMessagesTable, chatsTable, usersTable } from '../postgres/schema.ts';
import { readStoredAuthorIdentity } from './message-shape.ts';

const lastMessageAgentsTable = alias(agentsTable, 'last_message_agent');
const lastMessageUsersTable = alias(usersTable, 'last_message_user');

/** The shape the lateral join hands back, before the author is named. */
export interface StoredChatLastMessage {
    authorAgentDisplayName: string | null;
    authorAgentId: string | null;
    authorUserDisplayName: string | null;
    authorUserId: string | null;
    content: string | null;
    createdAt: Date | null;
}

/**
 * The newest top-level Message in each Chat, as one correlated lateral read
 * against `chat_messages (server_id, chat_id, sequence)`. Thread replies are
 * stored in the Thread's own Chat row, so scoping by `chat_id` already keeps
 * them out of the parent Chat's line — no extra predicate needed. `scope`
 * narrows which Messages qualify, as a predicate on `chat_messages`.
 */
export function chatLastMessageLateral(db: HausDatabase, scope?: SQL) {
    return db
        .select({
            // Both author tables carry `display_name`, so the lateral names each
            // one explicitly; two same-named output columns are ambiguous. The
            // author ids follow suit so `content` is the first plain column of
            // the join: Drizzle reads that one to decide the whole record is
            // absent, which is exactly true when no Message matched.
            authorAgentDisplayName: sql<string | null>`${lastMessageAgentsTable.displayName}`.as(
                'author_agent_display_name'
            ),
            authorAgentId: sql<string | null>`${chatMessagesTable.authorAgentId}`.as(
                'author_agent_id'
            ),
            authorUserDisplayName: sql<string | null>`${lastMessageUsersTable.displayName}`.as(
                'author_user_display_name'
            ),
            authorUserId: sql<string | null>`${chatMessagesTable.authorUserId}`.as(
                'author_user_id'
            ),
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
        })
        .from(chatMessagesTable)
        .leftJoin(
            lastMessageAgentsTable,
            and(
                eq(lastMessageAgentsTable.serverId, chatMessagesTable.serverId),
                eq(lastMessageAgentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(
            lastMessageUsersTable,
            eq(lastMessageUsersTable.id, chatMessagesTable.authorUserId)
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, chatsTable.serverId),
                eq(chatMessagesTable.chatId, chatsTable.id),
                scope
            )
        )
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(1)
        .as('chat_last_message');
}

/**
 * A Chat with no Message, and a Message whose author no longer resolves to a
 * name, both read as no last message. Nothing here invents an author.
 */
export function toChatLastMessage(row: StoredChatLastMessage | null): ChatLastMessage | null {
    if (row === null || row.content === null || row.createdAt === null) {
        return null;
    }
    const author = readStoredAuthorIdentity(row);
    if (!author) {
        return null;
    }
    return {
        authorDisplayName: author.displayName,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
    };
}
