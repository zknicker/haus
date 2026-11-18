import type { Chat, ChatUnreadPreview, ChatUnreadPreviewTask } from '@haus/api';

/** A followed Task's unread preview: its row names the Task (ADR 0053 decision 9). */
export type FollowedTaskPreview = ChatUnreadPreview & { task: ChatUnreadPreviewTask };

/**
 * One Unread row: a Channel or DM with its own unread messages, or a followed
 * Task with unread messages, which reads like an unread Channel (ADR 0053
 * decision 9). Being assigned a Task makes you a follower; there is no
 * separate assignment row.
 */
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

/**
 * How many rows `selectUnreadRows` returns: the unread Chats and the followed
 * Tasks with unread messages. A badge selects the Chat count from the list,
 * so a message that only moves a count inside an already unread Chat, or
 * reorders the list, leaves the badge alone.
 */
export function countUnreadChats(chats: readonly Pick<Chat, 'unreadCount'>[]): number {
    return chats.filter(isUnreadChat).length;
}

/** The followed Tasks among the previews: the rows `chat.list` never names. */
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
