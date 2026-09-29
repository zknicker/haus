import type { ServerDurableEvent } from '@haus/api';
import { sql } from 'drizzle-orm';
import {
    countNeedsYouChats,
    type NeedsYouChatRow,
    readNeedsYouChats,
} from '../needs-you/needs-you-query.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { readMemberServerIds, readPushableMembers } from './push-devices.ts';

type MessageCreatedEvent = Extract<ServerDurableEvent, { type: 'message.created' }>;

export interface PushRecipient {
    /** Needs you rows across every Server the human belongs to. */
    badge: number;
    /** The recipient's Needs you row this message now tops. */
    row: NeedsYouChatRow;
    userId: string;
}

/**
 * Who a new message should push. The event's addressing hints (mentions, the
 * inline parent's and Thread anchor's human authors) and the DM's members only
 * narrow the candidates; Needs you itself decides. A human is pushed only when
 * their Needs you row for the Chat now ends at this message, so every rule it
 * applies — own messages, access, archived Chats, Done, an answer already
 * given — applies to push without a second copy.
 */
export async function readPushRecipients(
    db: HausDatabase,
    event: MessageCreatedEvent
): Promise<PushRecipient[]> {
    const candidates = new Set([
        ...event.mentionedUserIds,
        ...(event.replyToAuthorUserId ? [event.replyToAuthorUserId] : []),
        ...(event.threadAnchorAuthorUserId ? [event.threadAnchorAuthorUserId] : []),
        ...(await readDmMemberIds(db, event)),
    ]);
    if (event.authorUserId) {
        candidates.delete(event.authorUserId);
    }
    const pushable = await readPushableMembers(db, event.serverId, [...candidates]);
    const recipients: PushRecipient[] = [];
    for (const userId of pushable) {
        const rows = await readNeedsYouChats(db, {
            serverId: event.serverId,
            viewerUserId: userId,
        });
        const row = rows.find((candidate) => candidate.messageId === event.messageId);
        if (row) {
            recipients.push({
                badge: await readBadge(db, userId, event.serverId, rows),
                row,
                userId,
            });
        }
    }
    return recipients;
}

/** This Server's rows are already read; the rest come from one count statement. */
async function readBadge(
    db: HausDatabase,
    userId: string,
    serverId: string,
    rowsHere: readonly NeedsYouChatRow[]
) {
    const otherServerIds = (await readMemberServerIds(db, userId)).filter(
        (memberServerId) => memberServerId !== serverId
    );
    return (
        rowsHere.length +
        (await countNeedsYouChats(db, { serverIds: otherServerIds, viewerUserId: userId }))
    );
}

/** Both humans of the DM the message is in, directly or through a Thread on it. */
async function readDmMemberIds(
    db: Pick<HausDatabase, 'execute'>,
    event: MessageCreatedEvent
): Promise<string[]> {
    const rows = (await db.execute(sql`
        select dm.dm_member_one_user_id as one, dm.dm_member_two_user_id as two
        from chats chat
        join chats dm
            on dm.server_id = chat.server_id
            and dm.id = coalesce(chat.parent_chat_id, chat.id)
        where chat.server_id = ${event.serverId}
            and chat.id = ${event.chatId}
            and dm.kind = 'dm'
    `)) as Array<{ one: string | null; two: string | null }>;
    return rows.flatMap((row) => [row.one, row.two]).filter((id): id is string => id !== null);
}
