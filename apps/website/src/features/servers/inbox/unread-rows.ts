import type { Chat, UnreadThread } from '@haus/api';

/** One Unread row: a Channel or DM with its own unread messages, or an unread Thread. */
export type UnreadRow =
    | { chat: Chat; id: string; kind: 'chat' }
    | { id: string; kind: 'thread'; parent: Chat; thread: UnreadThread };

/**
 * The Inbox's Unread section and its sidebar badge: every Channel and DM with
 * its own messages unread (`chat.list`'s `unreadCount`) and every unread
 * Thread (`thread.listUnread`), most recently active first, one row each. A
 * Thread is unread on its own, never through its parent (ADR 0043). A Thread
 * whose parent the list does not hold yet waits for it, so a row always has
 * its parent to name and the badge never counts a row the section hides.
 *
 * Timestamps carry an offset rather than a fixed zone, so they are compared
 * as instants — a lexical compare would order `-04:00` against `Z` by its text.
 */
export function selectUnreadRows(
    chats: readonly Chat[],
    threads: readonly UnreadThread[]
): UnreadRow[] {
    const chatById = new Map(chats.map((chat) => [chat.id, chat]));
    const rows: UnreadRow[] = chats
        .filter(isUnreadChat)
        .map((chat) => ({ chat, id: chat.id, kind: 'chat' }));
    for (const thread of threads) {
        const parent = chatById.get(thread.parentChatId);
        if (parent) {
            rows.push({ id: thread.threadChatId, kind: 'thread', parent, thread });
        }
    }
    return rows.sort((a, b) => activityTime(b) - activityTime(a));
}

/** What the Chat list contributes to the Unread count: its unread Chats, and which parents exist. */
export interface UnreadChatFacts {
    /** Sorted, so a list reordered by activity selects equal facts. */
    chatIds: string[];
    unreadChats: number;
}

/**
 * The Chat list reduced to the facts `countUnreadRows` needs. A badge selects
 * these, so a message that only moves a count inside an already unread Chat,
 * or reorders the list, leaves the selection — and the badge — alone.
 */
export function unreadChatFacts(chats: readonly Chat[]): UnreadChatFacts {
    return {
        chatIds: chats.map((chat) => chat.id).sort(),
        unreadChats: chats.filter(isUnreadChat).length,
    };
}

/** How many rows `selectUnreadRows` returns, from the Chat facts and each unread Thread's parent. */
export function countUnreadRows(
    chats: UnreadChatFacts,
    threadParentIds: readonly string[]
): number {
    const chatIds = new Set(chats.chatIds);
    return chats.unreadChats + threadParentIds.filter((parentId) => chatIds.has(parentId)).length;
}

function isUnreadChat(chat: Pick<Chat, 'unreadCount'>) {
    return chat.unreadCount > 0;
}

function activityTime(row: UnreadRow) {
    const at = row.kind === 'chat' ? row.chat.lastActivityAt : row.thread.lastActivityAt;
    return at ? Date.parse(at) : 0;
}
