import type { Chat } from '@haus/api';

/**
 * The Inbox's Unread section and its sidebar badge: every Channel and DM with
 * something unread — its own messages or the Thread replies it rolls up —
 * most recently active first, one per Chat. It is `chat.list`'s own
 * `unreadCount`, the same count iPhone badges by, so no surface invents a
 * second meaning of unread.
 *
 * Timestamps carry an offset rather than a fixed zone, so they are compared
 * as instants — a lexical compare would order `-04:00` against `Z` by its text.
 */
export function selectUnreadChats(chats: readonly Chat[]): Chat[] {
    return chats
        .filter((chat) => chat.unreadCount > 0)
        .sort((a, b) => lastActivityTime(b) - lastActivityTime(a));
}

function lastActivityTime(chat: Chat) {
    return chat.lastActivityAt ? Date.parse(chat.lastActivityAt) : 0;
}
