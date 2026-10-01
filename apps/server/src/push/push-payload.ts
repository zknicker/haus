import {
    type MessageNotificationReason,
    type PushNotificationConversation,
    type PushNotificationPayload,
    pushAlertBodyMaxLength,
    pushNotificationSenderNameMaxLength,
} from '@haus/api';
import { absoluteAvatarUrlFor } from '../avatars/avatar-url.ts';
import { readStoredAuthor } from '../chats/message-shape.ts';
import { messagePreview } from './message-preview.ts';
import type { PushMessage } from './push-message.ts';

/**
 * The iPhone alert for a new message: the author (and the Channel, outside a
 * DM) as the title, a plain-text preview as the body, the sender and conversation the Notification Service
 * extension renders as a Communication Notification, and the ids a tap routes
 * by. Returns null when the author or Channel name cannot be resolved, rather
 * than inventing either.
 */
export function buildPushPayload(
    row: PushMessage,
    input: {
        appOrigin: string;
        badge: number | null;
        reason: MessageNotificationReason;
        serverId: string;
    }
): PushNotificationPayload | null {
    const author = readStoredAuthor(row);
    const conversation = readConversation(row);
    if (!(author && conversation)) {
        return null;
    }
    const name = clampName(author.displayName);
    const title = conversation.kind === 'channel' ? `${name} in #${conversation.name}` : name;
    return {
        aps: {
            alert: { body: messagePreview(row.content, pushAlertBodyMaxLength), title },
            ...(input.badge === null ? {} : { badge: input.badge }),
            'mutable-content': 1,
            sound: 'default',
            'thread-id': row.conversationChatId,
        },
        chatId: row.chatId,
        conversation,
        conversationChatId: row.conversationChatId,
        messageId: row.messageId,
        reason: input.reason,
        sender: {
            avatarUrl: absoluteAvatarUrlFor(author.avatarId, input.appOrigin),
            id: author.id,
            kind: author.kind,
            name,
        },
        serverId: input.serverId,
        threadAnchorMessageId: row.chatId === row.conversationChatId ? null : row.anchorMessageId,
    };
}

function readConversation(row: PushMessage): PushNotificationConversation | null {
    if (row.conversationKind === 'dm') {
        return { kind: 'dm', name: null };
    }
    return row.conversationName ? { kind: 'channel', name: row.conversationName } : null;
}

/** Cuts a name to the push budget on a code point boundary, with an ellipsis. */
function clampName(name: string): string {
    if (name.length <= pushNotificationSenderNameMaxLength) {
        return name;
    }
    let end = 0;
    for (const character of name) {
        if (end + character.length >= pushNotificationSenderNameMaxLength) {
            break;
        }
        end += character.length;
    }
    return `${name.slice(0, end)}…`;
}
