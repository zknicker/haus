import { expect, test } from 'bun:test';
import type { ChatMessage, ThreadSummary } from '@haus/api';
import { mergeChatMessagePages } from './use-chat-messages.ts';

test('chat pages merge oldest-first while preserving the newest duplicate row', () => {
    const newestDuplicate = message('msg_duplicate', 2, 'newest copy');
    const merged = mergeChatMessagePages([
        {
            messages: [message('msg_new', 3), newestDuplicate],
            nextBeforeSequence: 2,
            nextAfterSequence: null,
            threads: [thread('msg_new', 1)],
        },
        {
            messages: [message('msg_old', 1), message('msg_duplicate', 2, 'older copy')],
            nextBeforeSequence: null,
            nextAfterSequence: 2,
            threads: [thread('msg_new', 0)],
        },
    ]);

    expect(merged?.messages.map(({ id }) => id)).toEqual(['msg_old', 'msg_duplicate', 'msg_new']);
    expect(merged?.messages.find(({ id }) => id === 'msg_duplicate')).toBe(newestDuplicate);
    expect(merged?.threads).toEqual([thread('msg_new', 1)]);
    expect(merged?.nextBeforeSequence).toBeNull();
    expect(merged?.nextAfterSequence).toBeNull();
});

function message(id: string, sequence: number, content = id): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_inline' },
        body: { kind: 'text' },
        chatId: 'cht_inline',
        content,
        createdAt: '2026-08-22T12:00:00.000Z',
        id,
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence,
        serverId: 'srv_inline',
        sessionGeneration: null,
    };
}

function thread(anchorMessageId: string, replyCount: number): ThreadSummary {
    return {
        anchorMessageId,
        followed: false,
        latestReplyAt: null,
        recentReplies: [],
        replyCount,
        threadChatId: 'cht_thread',
        unreadCount: 0,
    };
}
