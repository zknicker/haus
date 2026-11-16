import type { Chat, TaskInboxItem, UnreadThread } from '@haus/api';

/**
 * One Unread row: a Channel or DM with its own unread messages, an unread
 * Thread, or a Task assigned to the reader (ADR 0051).
 */
export type UnreadRow =
    | { chat: Chat; id: string; kind: 'chat' }
    | { id: string; kind: 'thread'; parent: Chat; thread: UnreadThread }
    | { id: string; item: TaskInboxItem; kind: 'task' };

/**
 * The Inbox's Unread section and its sidebar badge: every Channel and DM with
 * its own messages unread (`chat.list`'s `unreadCount`), every unread Thread
 * (`thread.listUnread`), and every Task item (`taskInbox.list`), most recently
 * active first, one row each; a Task's activity is its assignment, and Tasks
 * never bundle. A Thread is unread on its own, never through its parent (ADR
 * 0043). A Thread whose parent the list does not hold yet waits for it, so a
 * row always has its parent to name and the badge never counts a row the
 * section hides.
 *
 * Timestamps carry an offset rather than a fixed zone, so they are compared
 * as instants — a lexical compare would order `-04:00` against `Z` by its text.
 */
export function selectUnreadRows(
    chats: readonly Chat[],
    threads: readonly UnreadThread[],
    taskItems: readonly TaskInboxItem[] = []
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
    for (const item of taskItems) {
        rows.push({ id: item.task.id, item, kind: 'task' });
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

/**
 * How many rows `selectUnreadRows` returns, from the Chat facts, each unread
 * Thread's parent, and the Task items.
 */
export function countUnreadRows(
    chats: UnreadChatFacts,
    threadParentIds: readonly string[],
    taskItemCount = 0
): number {
    const chatIds = new Set(chats.chatIds);
    const threads = threadParentIds.filter((parentId) => chatIds.has(parentId)).length;
    return chats.unreadChats + threads + taskItemCount;
}

function isUnreadChat(chat: Pick<Chat, 'unreadCount'>) {
    return chat.unreadCount > 0;
}

function activityTime(row: UnreadRow) {
    const at = rowActivityAt(row);
    return at ? Date.parse(at) : 0;
}

function rowActivityAt(row: UnreadRow) {
    switch (row.kind) {
        case 'chat':
            return row.chat.lastActivityAt;
        case 'thread':
            return row.thread.lastActivityAt;
        default:
            return row.item.assignedAt;
    }
}
