import type { Chat, ChatUnreadPreview, ChatUnreadPreviewTask } from '@haus/api';

export type FollowedTaskPreview = ChatUnreadPreview & { task: ChatUnreadPreviewTask };

export type UnreadRow =
    | { chat: Chat; id: string; kind: 'chat' }
    | { id: string; kind: 'task-chat'; preview: FollowedTaskPreview };

/**
 * The Inbox's Unread section and its sidebar badge: every Channel and DM with
 * its own messages unread (`chat.list`'s `unreadCount`) and every followed
 * Task with unread messages (`chat.unreadPreviews`), most recently active
 * first, one row each.
 *
 * Timestamps carry an offset rather than a fixed zone, so they are compared
 * as instants — a lexical compare would order `-04:00` against `Z` by its text.
 */
export function selectUnreadRows(
    chats: readonly Chat[],
    taskPreviews: readonly FollowedTaskPreview[] = []
): UnreadRow[] {
    const rows: UnreadRow[] = chats
        .filter(isUnreadChat)
        .map((chat) => ({ chat, id: chat.id, kind: 'chat' }));
    for (const preview of taskPreviews) {
        rows.push({ id: preview.chatId, kind: 'task-chat', preview });
    }
    return rows.sort((a, b) => activityTime(b) - activityTime(a));
}

export function countUnreadChats(chats: readonly Pick<Chat, 'unreadCount'>[]): number {
    return chats.filter(isUnreadChat).length;
}

export function followedTaskPreviews(
    previews: readonly ChatUnreadPreview[]
): FollowedTaskPreview[] {
    return previews.filter((preview): preview is FollowedTaskPreview => preview.task !== null);
}

function isUnreadChat(chat: Pick<Chat, 'unreadCount'>) {
    return chat.unreadCount > 0;
}

function activityTime(row: UnreadRow) {
    const at =
        row.kind === 'chat' ? row.chat.lastActivityAt : row.preview.messages.at(-1)?.createdAt;
    return at ? Date.parse(at) : 0;
}
