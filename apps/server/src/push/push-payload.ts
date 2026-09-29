import { type PushNotificationPayload, pushAlertBodyMaxLength } from '@haus/api';
import { readStoredAuthorIdentity } from '../chats/message-shape.ts';
import { needsYouPreview } from '../needs-you/needs-you-preview.ts';
import type { NeedsYouChatRow } from '../needs-you/needs-you-query.ts';

/**
 * The iPhone alert for a Needs you row's newest message: the author (and the
 * Channel, outside a DM) as the title, the same plain-text preview the Inbox
 * shows as the body, and the ids a tap routes by.
 */
export function buildPushPayload(
    row: NeedsYouChatRow,
    input: { badge: number | null; serverId: string }
): PushNotificationPayload {
    const author = readStoredAuthorIdentity(row)?.displayName ?? 'Someone';
    const title =
        row.conversationKind === 'channel' && row.conversationName
            ? `${author} in #${row.conversationName}`
            : author;
    return {
        aps: {
            alert: { body: needsYouPreview(row.content, pushAlertBodyMaxLength), title },
            ...(input.badge === null ? {} : { badge: input.badge }),
            sound: 'default',
            'thread-id': row.conversationChatId,
        },
        chatId: row.chatId,
        conversationChatId: row.conversationChatId,
        messageId: row.messageId,
        serverId: input.serverId,
        threadAnchorMessageId: row.chatId === row.conversationChatId ? null : row.anchorMessageId,
    };
}
