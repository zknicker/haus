import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, ThreadSummary } from '@haus/api';
import {
    type ChatMessageProjectionInput,
    emptyChatAgents,
    emptyChatMessageProjection,
    emptyChatThreads,
    projectStableChatMessages,
} from './chat-message-projection.ts';

test('projecting the same snapshot twice reuses every row', () => {
    const messages = [message('msg_1', 'first'), message('msg_2', 'second')];
    const first = projectStableChatMessages(input(messages), emptyChatMessageProjection);
    const second = projectStableChatMessages(input(messages), first);

    assert.equal(second, first);
    assert.equal(second.rows, first.rows);
});

test('a refetch that changed nothing keeps the rows array identity', () => {
    // React Query hands back the same message objects for everything it did
    // not change, so only the array wrapper is new.
    const messages = [message('msg_1', 'first'), message('msg_2', 'second')];
    const first = projectStableChatMessages(input(messages), emptyChatMessageProjection);
    const second = projectStableChatMessages(input([...messages]), first);

    assert.equal(second.rows, first.rows);
});

test('only the changed message loses its row identity', () => {
    const unchanged = message('msg_1', 'first');
    const messages = [unchanged, message('msg_2', 'second')];
    const first = projectStableChatMessages(input(messages), emptyChatMessageProjection);
    const second = projectStableChatMessages(
        input([unchanged, message('msg_2', 'second edited')]),
        first
    );

    assert.notEqual(second.rows, first.rows);
    assert.equal(second.rows[0], first.rows[0]);
    assert.notEqual(second.rows[1], first.rows[1]);
    assert.equal(
        second.rows[1]?.kind === 'message' && second.rows[1].message.content,
        'second edited'
    );
});

test('an appended message leaves the existing rows alone', () => {
    const messages = [message('msg_1', 'first')];
    const first = projectStableChatMessages(input(messages), emptyChatMessageProjection);
    const second = projectStableChatMessages(
        input([...messages, message('msg_2', 'second')]),
        first
    );

    assert.equal(second.rows.length, 2);
    assert.equal(second.rows[0], first.rows[0]);
});

test('a new thread summary reprojects only its anchor row', () => {
    const messages = [message('msg_1', 'first'), message('msg_2', 'second')];
    const first = projectStableChatMessages(input(messages), emptyChatMessageProjection);
    const second = projectStableChatMessages(input(messages, [thread('msg_2')]), first);

    assert.equal(second.rows[0], first.rows[0]);
    assert.notEqual(second.rows[1], first.rows[1]);
    assert.equal(
        second.rows[1]?.kind === 'message' && second.rows[1].thread?.anchorMessageId,
        'msg_2'
    );
});

function input(
    messages: readonly ChatMessage[],
    threads: readonly ThreadSummary[] = emptyChatThreads
): ChatMessageProjectionInput {
    return { agents: emptyChatAgents, messages, threads };
}

function message(id: string, content: string): ChatMessage {
    return {
        attachments: [],
        author: { kind: 'human', userId: 'usr_1' },
        body: { kind: 'text' },
        chatId: 'cht_1',
        content,
        createdAt: '2026-08-11T00:00:00.000Z',
        id,
        nonce: `nonce_${id}`,
        reactions: [],
        reply: null,
        runId: null,
        sequence: Number(id.slice(-1)),
        serverId: 'srv_1',
        sessionGeneration: null,
        task: null,
    };
}

function thread(anchorMessageId: string): ThreadSummary {
    return {
        anchorMessageId,
        followed: true,
        latestReplyAt: '2026-08-11T00:01:00.000Z',
        recentReplies: [],
        replyCount: 1,
        threadChatId: 'cht_thread_1',
        unreadCount: 0,
    };
}
