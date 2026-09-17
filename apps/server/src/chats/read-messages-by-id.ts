import type { ChatMessage } from '@haus/api';
import { and, eq, getTableColumns, inArray } from 'drizzle-orm';
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
import { readMessageBodies } from './message-bodies.ts';
import { readChatMessageReactions } from './message-reactions.ts';
import { readStoredAuthorProfile, toChatMessage } from './message-shape.ts';
import { readInlineReplyContexts } from './reply-context.ts';

/**
 * Reads named Messages the way the Chat transcript reads a page: the same
 * author profile, typed body, cause, attachment, and task projections. Callers
 * that already hold a Message use it to pull in one more a surface needs — the
 * Thread anchor an Inbox Ask row answers, for instance.
 * Authorization belongs to the caller, which is why this takes explicit ids.
 */
export async function readMessagesById(
    db: HausDatabase,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, ChatMessage>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
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
        .where(
            and(eq(chatMessagesTable.serverId, serverId), inArray(chatMessagesTable.id, messageIds))
        );
    const foundIds = rows.map((row) => row.id);
    const [attachments, tasks, causes, bodies, reactions, replies] = await Promise.all([
        readMessageAttachments(db, serverId, foundIds),
        listMessageTaskMap(db, serverId, foundIds),
        readMessageCauses(db, serverId, foundIds),
        readMessageBodies(db, serverId, foundIds),
        readChatMessageReactions(db, serverId, foundIds),
        readInlineReplyContexts(db, serverId, rows),
    ]);
    return new Map(
        rows.map((row) => [
            row.id,
            {
                ...toChatMessage(row, {
                    attachments: attachments.get(row.id) ?? [],
                    authorProfile: readStoredAuthorProfile(row),
                    body: bodies.get(row.id),
                    cause: causes.get(row.id),
                    reactions: reactions.get(row.id),
                    reply: replies.get(row.id) ?? null,
                }),
                task: tasks.get(row.id) ?? null,
            },
        ])
    );
}
