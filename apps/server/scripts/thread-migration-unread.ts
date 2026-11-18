import type { SQL } from 'bun';

/**
 * Unread sets for the Thread → inline-reply migration (ADR 0052 decision 14),
 * keyed `user|server|reader|chat` or `agent|server|reader|chat`, under the
 * Channel and DM rule: someone else wrote it, past the reader's position.
 *
 * The migration marks every affected Chat (one that received moved Thread
 * Messages) read through its newest Message for every reader, and leaves every
 * other Chat's positions alone. So after it, unread in an affected Chat is
 * zero for every reader, unread anywhere else is exactly what it was, and no
 * queued Agent inbox item names a moved Message or a Message in an affected
 * Chat. Readers are current members and active Agents who can read the Chat
 * (Channels are open; a DM is read by its own people and Agent). Archive and
 * Channel mutes filter both sides equally and are left out.
 */
export interface UnreadSnapshot {
    /** Parents that will receive at least one moved Message. */
    affected: ChatRef[];
    /** Every Chat that is not a Thread, whose unread is compared. */
    chats: ChatRef[];
    movedMessageIds: string[];
    unread: Record<string, string[]>;
}

export interface UnreadAfter {
    /** Queued, unattached Agent inbox items backed by a moved or affected-Chat Message. */
    pendingInboxItems: number;
    unread: Record<string, string[]>;
}

export interface UnreadComparison {
    affectedChats: number;
    /** Must be zero: unread left in an affected Chat after the move. */
    affectedUnreadAfter: number;
    /** Unread in affected Chats before the move, under the Channel rule alone. */
    affectedUnreadBefore: number;
    /** Must be zero: queued inbox items still naming moved or affected-Chat Messages. */
    pendingInboxItems: number;
    readers: number;
    /** Must be zero: reader/Chat pairs outside affected Chats whose unread changed. */
    unaffectedChanged: number;
    unaffectedChangedKeys: string[];
    unaffectedUnread: number;
}

interface ChatRef {
    chatId: string;
    serverId: string;
}

export async function readUnreadBefore(database: SQL): Promise<UnreadSnapshot> {
    const chats = (await database`
        SELECT server_id AS "serverId", id AS "chatId"
        FROM chats WHERE kind <> 'thread' ORDER BY 1, 2`) as ChatRef[];
    const affected = (await database`
        SELECT DISTINCT thread.server_id AS "serverId", thread.parent_chat_id AS "chatId"
        FROM chats thread
        WHERE thread.kind = 'thread'
            AND EXISTS (
                SELECT 1 FROM chat_messages message
                WHERE message.server_id = thread.server_id AND message.chat_id = thread.id
            )
        ORDER BY 1, 2`) as ChatRef[];
    const moved = (await database`
        SELECT message.id FROM chat_messages message
        JOIN chats thread ON thread.server_id = message.server_id AND thread.id = message.chat_id
        WHERE thread.kind = 'thread' ORDER BY 1`) as { id: string }[];
    return {
        affected,
        chats,
        movedMessageIds: moved.map((row) => row.id),
        unread: await readChatUnread(database, chats),
    };
}

export async function readUnreadAfter(database: SQL, before: UnreadSnapshot): Promise<UnreadAfter> {
    const [pending] = (await database.unsafe(
        `SELECT count(*)::integer AS count
        FROM agent_inbox item
        JOIN chat_messages message ON message.server_id = item.server_id AND message.id = item.dedupe_key
        WHERE item.state = 'queued' AND item.run_id IS NULL
            AND (
                message.id IN (SELECT jsonb_array_elements_text(($1::text)::jsonb))
                OR (message.server_id, message.chat_id) IN (
                    SELECT affected."serverId", affected."chatId"
                    FROM jsonb_to_recordset(($2::text)::jsonb) AS affected("serverId" text, "chatId" text)
                )
            )`,
        [JSON.stringify(before.movedMessageIds), JSON.stringify(before.affected)]
    )) as { count: number }[];
    return {
        pendingInboxItems: pending?.count ?? 0,
        unread: await readChatUnread(database, before.chats),
    };
}

/** Affected Chats must read zero; every other reader/Chat pair must be unchanged. */
export function compareUnread(before: UnreadSnapshot, after: UnreadAfter): UnreadComparison {
    const affected = new Set(before.affected.map((chat) => `${chat.serverId}|${chat.chatId}`));
    const keys = new Set([...Object.keys(before.unread), ...Object.keys(after.unread)]);
    const comparison: UnreadComparison = {
        affectedChats: affected.size,
        affectedUnreadAfter: 0,
        affectedUnreadBefore: 0,
        pendingInboxItems: after.pendingInboxItems,
        readers: keys.size,
        unaffectedChanged: 0,
        unaffectedChangedKeys: [],
        unaffectedUnread: 0,
    };
    for (const key of keys) {
        const was = before.unread[key] ?? [];
        const now = after.unread[key] ?? [];
        const [, serverId, , chatId] = key.split('|');
        if (affected.has(`${serverId}|${chatId}`)) {
            comparison.affectedUnreadBefore += was.length;
            comparison.affectedUnreadAfter += now.length;
            continue;
        }
        comparison.unaffectedUnread += now.length;
        if (was.join(',') !== now.join(',')) {
            comparison.unaffectedChanged += 1;
            comparison.unaffectedChangedKeys.push(key);
        }
    }
    comparison.unaffectedChangedKeys = comparison.unaffectedChangedKeys.slice(0, 5);
    return comparison;
}

export function unreadHolds(comparison: UnreadComparison): boolean {
    return (
        comparison.affectedUnreadAfter === 0 &&
        comparison.unaffectedChanged === 0 &&
        comparison.pendingInboxItems === 0
    );
}

interface UnreadRow {
    chat_id: string;
    message_id: string;
    reader: string;
    reader_kind: 'agent' | 'user';
    server_id: string;
}

/** Unread under the Channel and DM rule for every reader of each listed Chat. */
async function readChatUnread(database: SQL, chats: ChatRef[]) {
    const rows = (await database.unsafe(
        `WITH listed AS (
            SELECT listed."serverId" AS server_id, listed."chatId" AS chat_id
            FROM jsonb_to_recordset(($1::text)::jsonb) AS listed("serverId" text, "chatId" text)
        )
        SELECT 'user' AS reader_kind, listed.server_id, member.user_id AS reader,
            listed.chat_id, message.id AS message_id
        FROM listed
        JOIN chats chat ON chat.server_id = listed.server_id AND chat.id = listed.chat_id
        JOIN server_memberships member ON member.server_id = listed.server_id
            AND member.revoked_at IS NULL AND (chat.kind <> 'dm'
                OR member.user_id IN (chat.dm_member_one_user_id, chat.dm_member_two_user_id))
        JOIN chat_messages message ON message.server_id = listed.server_id AND message.chat_id = listed.chat_id
        LEFT JOIN chat_reads reading
            ON reading.server_id = listed.server_id AND reading.chat_id = listed.chat_id
            AND reading.reader_user_id = member.user_id
        WHERE (message.author_user_id IS NULL OR message.author_user_id <> member.user_id)
            AND message.sequence > coalesce(reading.sequence, 0)
        UNION ALL
        SELECT 'agent', listed.server_id, agent.id, listed.chat_id, message.id
        FROM listed
        JOIN chats chat ON chat.server_id = listed.server_id AND chat.id = listed.chat_id
        JOIN agents agent ON agent.server_id = listed.server_id
            AND agent.retired_at IS NULL AND (chat.kind <> 'dm' OR agent.id = chat.dm_agent_id)
        JOIN chat_messages message ON message.server_id = listed.server_id AND message.chat_id = listed.chat_id
        LEFT JOIN agent_chat_reads reading
            ON reading.server_id = listed.server_id AND reading.chat_id = listed.chat_id
            AND reading.agent_id = agent.id
        WHERE message.author_agent_id IS DISTINCT FROM agent.id
            AND message.sequence > coalesce(reading.sequence, 0)`,
        [JSON.stringify(chats)]
    )) as UnreadRow[];
    const unread: Record<string, string[]> = {};
    for (const row of rows) {
        const key = `${row.reader_kind}|${row.server_id}|${row.reader}|${row.chat_id}`;
        unread[key] ??= [];
        unread[key].push(row.message_id);
    }
    for (const ids of Object.values(unread)) {
        ids.sort();
    }
    return unread;
}
