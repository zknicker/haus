import { type ChatUnreadPreview, unreadPreviewMessageLimit } from '@haus/api';
import { and, eq, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import {
    threadNewestCountedReplyIds,
    threadUnreadCount,
    unreadThreads,
} from '../threads/thread-unread.ts';
import type { HausUser } from '../users/haus-user.ts';
import { chatNewestUnreadMessageIds, chatUnreadCount, listedChats } from './chat-unread.ts';
import { readMessagesById } from './read-messages-by-id.ts';

/**
 * The waiting messages behind every unread Inbox row, in one read: each
 * unread Channel or DM (`listedChats` with an `unreadCount`) and each unread
 * Thread (`unreadThreads`), with its newest counted messages projected the
 * way the transcript projects them. The row predicates are the ones
 * `chat.list`, `thread.listUnread`, and the badge use, so a preview exists for
 * exactly the rows the Inbox shows.
 */
export async function listUnreadPreviews(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
): Promise<ChatUnreadPreview[]> {
    await requireServerMembership(db, member, serverId);

    if (!member) {
        return [];
    }

    const limit = unreadPreviewMessageLimit;
    const rows = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            chatId: chatsTable.id,
            messageIds: sql<string[]>`case when ${chatsTable.kind} = 'thread'
                then ${threadNewestCountedReplyIds(member.id, limit)}
                else ${chatNewestUnreadMessageIds(member.id, limit)} end`,
            unreadCount: sql<number>`case when ${chatsTable.kind} = 'thread'
                then ${threadUnreadCount(member.id)}
                else ${chatUnreadCount(member.id)} end`,
        })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                or(
                    sql`(${listedChats(member.id, 'active')} and ${chatUnreadCount(member.id)} > 0)`,
                    unreadThreads(member.id)
                )
            )
        )
        .orderBy(sql`${chatsTable.lastActivityAt} desc nulls last`, chatsTable.id);

    const messages = await readMessagesById(
        db,
        serverId,
        rows.flatMap((row) =>
            row.anchorMessageId ? [...row.messageIds, row.anchorMessageId] : row.messageIds
        )
    );

    return rows.map((row) => toUnreadPreview(row, messages));
}

/** A counted id that no longer projects is a corrupt row; fail rather than show a gap. */
function toUnreadPreview(
    row: {
        anchorMessageId: string | null;
        chatId: string;
        messageIds: string[];
        unreadCount: number;
    },
    messages: Map<string, ChatUnreadPreview['messages'][number]>
): ChatUnreadPreview {
    const projected = [...row.messageIds].reverse().map((id) => {
        const message = messages.get(id);
        if (!message) {
            throw new Error(`Unread message ${id} in Chat ${row.chatId} did not project.`);
        }
        return message;
    });
    return {
        anchor: row.anchorMessageId ? (messages.get(row.anchorMessageId) ?? null) : null,
        chatId: row.chatId,
        earlierUnreadCount: Math.max(0, row.unreadCount - projected.length),
        messages: projected,
    };
}
