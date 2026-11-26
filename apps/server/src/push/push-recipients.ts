import {
    type MessageCreatedEvent,
    type MessageNotificationReason,
    messageNotificationCandidates,
    messageNotificationReason,
} from '@haus/api';
import { and, eq, gte } from 'drizzle-orm';
import { readCaptainChatSubscribers } from '../chats/captain-chat.ts';
import { visibleChats } from '../chats/chat-visibility.ts';
import { countUnreadInboxRows } from '../chats/unread-chat-count.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatReadsTable, chatsTable } from '../postgres/schema.ts';
import { readPushableMembers } from './push-devices.ts';
import { type PushMessage, readPushMessage } from './push-message.ts';

export interface PushRecipient {
    badge: number;
    reason: MessageNotificationReason;
    userId: string;
}

export async function readPushRecipients(
    db: HausDatabase,
    event: MessageCreatedEvent
): Promise<{ message: PushMessage; recipients: PushRecipient[] } | null> {
    const message = await readPushMessage(db, event);
    if (!message) {
        return null;
    }
    // A Captain chat is open to everyone, so only its subscribed members hear every message.
    const subscribers = new Set(
        event.conversationKind === 'captain' ? await readCaptainChatSubscribers(db, event) : []
    );
    const candidates = new Set([
        ...messageNotificationCandidates(event),
        ...(event.conversationKind === 'dm' ? message.dmMemberUserIds : []),
        ...subscribers,
    ]);
    const recipients: PushRecipient[] = [];
    for (const userId of await readPushableMembers(db, event.serverId, [...candidates])) {
        const reason =
            messageNotificationReason(event, userId) ??
            (subscribers.has(userId) && userId !== event.authorUserId ? 'subscribed' : null);
        if (
            reason &&
            (await canSeeChat(db, userId, event)) &&
            !(await hasReadMessage(db, userId, event))
        ) {
            recipients.push({ badge: await countUnreadInboxRows(db, userId), reason, userId });
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
