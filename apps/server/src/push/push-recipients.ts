import {
    type MessageNotificationReason,
    messageNotificationCandidates,
    messageNotificationReason,
    type ServerDurableEvent,
} from '@haus/api';
import { and, eq, gte } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { countUnreadChats } from '../chats/unread-chat-count.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatReadsTable, chatsTable } from '../postgres/schema.ts';
import { readPushableMembers } from './push-devices.ts';
import { type PushMessage, readPushMessage } from './push-message.ts';

type MessageCreatedEvent = Extract<ServerDurableEvent, { type: 'message.created' }>;

export interface PushRecipient {
    /** The human's unread Chats across every Server they belong to. */
    badge: number;
    reason: MessageNotificationReason;
    userId: string;
}

/**
 * Who a new message pushes, and the message as they will read it. The shared
 * `messageNotificationReason` rule decides (ADR 0038) — the same rule the App
 * applies to desktop and web notifications — over the event's own facts plus
 * the DM's members. Push then keeps only humans with a registered device who
 * can still see the Chat and have not already read the message — a Thread
 * message by the Thread's own read marker; an archived or deleted Chat pushes
 * nobody.
 */
export async function readPushRecipients(
    db: HausDatabase,
    event: MessageCreatedEvent
): Promise<{ message: PushMessage; recipients: PushRecipient[] } | null> {
    const message = await readPushMessage(db, event);
    if (!message) {
        return null;
    }
    const candidates = new Set([
        ...messageNotificationCandidates(event),
        ...(event.conversationKind === 'dm' ? message.dmMemberUserIds : []),
    ]);
    const recipients: PushRecipient[] = [];
    for (const userId of await readPushableMembers(db, event.serverId, [...candidates])) {
        const reason = messageNotificationReason(event, userId);
        if (
            reason &&
            (await canSeeChat(db, userId, event)) &&
            !(await hasReadMessage(db, userId, event))
        ) {
            recipients.push({ badge: await countUnreadChats(db, userId), reason, userId });
        }
    }
    return { message, recipients };
}

/** The human's read marker in the message's own Chat already covers it. */
async function hasReadMessage(
    db: Pick<HausDatabase, 'select'>,
    userId: string,
    event: Pick<MessageCreatedEvent, 'chatId' | 'sequence' | 'serverId'>
) {
    const [read] = await db
        .select({ sequence: chatReadsTable.sequence })
        .from(chatReadsTable)
        .where(
            and(
                eq(chatReadsTable.serverId, event.serverId),
                eq(chatReadsTable.chatId, event.chatId),
                eq(chatReadsTable.readerUserId, userId),
                gte(chatReadsTable.sequence, event.sequence)
            )
        )
        .limit(1);
    return read !== undefined;
}

async function canSeeChat(
    db: Pick<HausDatabase, 'select'>,
    userId: string,
    event: Pick<MessageCreatedEvent, 'chatId' | 'serverId'>
) {
    const [visible] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, event.serverId),
                eq(chatsTable.id, event.chatId),
                visibleChats(userId)
            )
        )
        .limit(1);
    return visible !== undefined;
}
