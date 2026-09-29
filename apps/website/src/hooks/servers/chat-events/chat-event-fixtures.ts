import type { ChatEventOf } from './chat-event-registry.ts';

/** Durable event builders shared by the Chat event listener tests. */
export function messageEvent(
    cursor: string,
    chatId: string,
    parentChatId: string | null = null,
    author: {
        authorUserId?: string | null;
        mentionedUserIds?: string[];
        replyToAuthorUserId?: string | null;
        threadAnchorAuthorUserId?: string | null;
    } = {}
): ChatEventOf<'message.created'> {
    return {
        authorUserId: author.authorUserId ?? null,
        chatId,
        createdAt: '2026-07-26T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        mentionedUserIds: author.mentionedUserIds ?? [],
        messageId: `message_${cursor}`,
        parentChatId,
        replyToAuthorUserId: author.replyToAuthorUserId ?? null,
        sequence: Number(cursor),
        serverId: 'server_one',
        threadAnchorAuthorUserId: author.threadAnchorAuthorUserId ?? null,
        type: 'message.created',
    };
}

export function reactionEvent(
    cursor: string,
    chatId: string,
    parentChatId: string | null = null
): ChatEventOf<'message.reaction.updated'> {
    return {
        chatId,
        createdAt: '2026-09-09T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        messageId: `message_${cursor}`,
        parentChatId,
        sequence: Number(cursor),
        serverId: 'server_one',
        type: 'message.reaction.updated',
    };
}

export function readEvent(cursor: string, chatId: string): ChatEventOf<'chat.read'> {
    return {
        chatId,
        createdAt: '2026-07-26T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        parentChatId: null,
        sequence: Number(cursor),
        serverId: 'server_one',
        type: 'chat.read',
    };
}

export function lifecycleEvent(
    cursor: string,
    chatId: string,
    action: 'archived' | 'created' | 'deleted' | 'unarchived' | 'updated'
): ChatEventOf<'chat.lifecycle'> {
    return {
        action,
        chatId,
        createdAt: '2026-08-10T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        parentChatId: null,
        sequence: 0,
        serverId: 'server_one',
        type: 'chat.lifecycle',
    };
}

export function threadFollowEvent(
    cursor: string,
    chatId: string,
    parentChatId: string
): ChatEventOf<'thread.follow.updated'> {
    return {
        chatId,
        createdAt: '2026-07-26T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        parentChatId,
        sequence: Number(cursor),
        serverId: 'server_one',
        type: 'thread.follow.updated',
    };
}

export function taskEvent(
    cursor: string,
    chatId: string,
    type: 'task.created' | 'task.updated' = 'task.updated'
): ChatEventOf<'task.created' | 'task.updated'> {
    return {
        chatId,
        createdAt: '2026-07-26T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        messageId: `message_${cursor}`,
        parentChatId: null,
        sequence: Number(cursor),
        serverId: 'server_one',
        type,
    };
}

export function taskLabelEvent(cursor: string, labelId: string): ChatEventOf<'task.label.updated'> {
    return {
        chatId: null,
        createdAt: '2026-07-26T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        labelId,
        parentChatId: null,
        sequence: 0,
        serverId: 'server_one',
        type: 'task.label.updated',
    };
}

export function reminderEvent(cursor: string, chatId: string): ChatEventOf<'reminder.changed'> {
    return {
        action: 'scheduled',
        chatId,
        createdAt: '2026-08-10T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        parentChatId: null,
        reminderId: `rem_${cursor}`,
        sequence: 0,
        serverId: 'server_one',
        type: 'reminder.changed',
    };
}

export function cloudAgentWorkEvent(
    cursor: string,
    chatId: string,
    parentChatId: string | null = null
): ChatEventOf<'cloud-agent-work.updated'> {
    return {
        chatId,
        cloudAgentWorkId: `caw_${cursor}`,
        createdAt: '2026-09-04T12:00:00.000Z',
        cursor,
        id: `event_${cursor}`,
        messageId: `message_${cursor}`,
        parentChatId,
        sequence: Number(cursor),
        serverId: 'server_one',
        type: 'cloud-agent-work.updated',
    };
}
