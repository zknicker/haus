import { expect, test } from 'bun:test';
import {
    channelCreateInputSchema,
    channelUpdateInputSchema,
    chatMessageSchema,
    chatMessagesInputSchema,
    chatSendInputSchema,
} from './chat.ts';
import {
    chatLifecycleEventSchema,
    messageCreatedEventSchema,
    messageReactionUpdatedEventSchema,
    threadActivitySchema,
} from './chat-events.ts';
import { chatMarkReadInputSchema } from './chat-read.ts';

test('Chat sends accept only client intent and never an authoritative actor', () => {
    expect(
        chatSendInputSchema.parse({
            chatId: 'cht_all',
            content: 'Hello from the Server.',
            nonce: 'send-1',
            serverId: 'srv_main',
        })
    ).toEqual({
        attachmentIds: [],
        chatId: 'cht_all',
        content: 'Hello from the Server.',
        nonce: 'send-1',
        serverId: 'srv_main',
    });

    expect(() =>
        chatSendInputSchema.parse({
            authorUserId: 'usr_intruder',
            chatId: 'cht_all',
            content: 'No.',
            nonce: 'send-2',
            serverId: 'srv_main',
        })
    ).toThrow();
});

test('Chat reads derive the reader from the verified Clerk member', () => {
    expect(
        chatMarkReadInputSchema.parse({
            chatId: 'cht_all',
            sequence: 4,
            serverId: 'srv_main',
        })
    ).toEqual({ chatId: 'cht_all', sequence: 4, serverId: 'srv_main' });
    expect(() =>
        chatMarkReadInputSchema.parse({
            chatId: 'cht_all',
            readerUserId: 'usr_intruder',
            sequence: 4,
            serverId: 'srv_main',
        })
    ).toThrow();
});

test('Chat history selectors are mutually exclusive and accept the zero after cursor', () => {
    const base = { chatId: 'cht_all', serverId: 'srv_main' };
    expect(chatMessagesInputSchema.parse(base)).toMatchObject(base);
    expect(chatMessagesInputSchema.parse({ ...base, afterSequence: 0 })).toMatchObject({
        afterSequence: 0,
    });
    expect(chatMessagesInputSchema.parse({ ...base, beforeSequence: 4 })).toMatchObject({
        beforeSequence: 4,
    });
    expect(chatMessagesInputSchema.parse({ ...base, aroundMessageId: 'msg_anchor' })).toMatchObject(
        { aroundMessageId: 'msg_anchor' }
    );
    expect(() =>
        chatMessagesInputSchema.parse({ ...base, afterSequence: 2, beforeSequence: 4 })
    ).toThrow();
    expect(() =>
        chatMessagesInputSchema.parse({ ...base, afterSequence: 2, aroundMessageId: 'msg_anchor' })
    ).toThrow();
});

test('Server messages and durable events keep stable Server and Chat identity', () => {
    const message = chatMessageSchema.parse({
        attachments: [],
        body: { kind: 'text' },
        author: { kind: 'human', userId: 'usr_human' },
        chatId: 'cht_all',
        content: 'Durable.',
        createdAt: '2026-07-26T12:00:00.000Z',
        id: 'msg_one',
        nonce: 'send-1',
        reactions: [
            {
                actors: [{ handle: 'alex', id: 'usr_human', kind: 'human' }],
                emoji: '👍',
            },
        ],
        runId: null,
        sequence: 1,
        serverId: 'srv_main',
    });
    expect(message.reactions).toEqual([
        {
            actors: [{ handle: 'alex', id: 'usr_human', kind: 'human' }],
            emoji: '👍',
        },
    ]);

    const created = messageCreatedEventSchema.parse({
        authorUserId: 'usr_human',
        chatId: message.chatId,
        conversationKind: 'channel',
        mentionedUserIds: [],
        message,
        parentChatId: null,
        replyToAuthorUserId: null,
        serverId: message.serverId,
        thread: null,
        threadAnchorAuthorUserId: null,
    });
    // The row keeps its send nonce, which retires the App's optimistic pending row.
    expect(created.message).toMatchObject({ id: 'msg_one', nonce: 'send-1', sequence: 1 });
    expect(() =>
        messageCreatedEventSchema.parse({ ...created, cursor: '4', type: 'message.created' })
    ).toThrow();
    expect(
        messageReactionUpdatedEventSchema.parse({
            chatId: message.chatId,
            messageId: message.id,
            parentChatId: null,
            reactions: message.reactions,
            serverId: message.serverId,
        })
    ).toMatchObject({ messageId: 'msg_one', reactions: [{ emoji: '👍' }] });
    expect(
        chatLifecycleEventSchema.parse({
            action: 'archived',
            chatId: message.chatId,
            serverId: message.serverId,
        })
    ).toEqual({ action: 'archived', chatId: 'cht_all', serverId: 'srv_main' });
});

test('A Thread reply carries viewer-neutral Thread activity, never the viewer state', () => {
    const activity = {
        anchorMessageId: 'msg_anchor',
        latestReplyAt: '2026-07-26T12:00:00.000Z',
        recentReplies: [],
        replyCount: 3,
        threadChatId: 'cht_thread',
    };
    expect(threadActivitySchema.parse(activity)).toEqual(activity);
    expect(() => threadActivitySchema.parse({ ...activity, followed: true })).toThrow();
    expect(() => threadActivitySchema.parse({ ...activity, unreadCount: 1 })).toThrow();
});

test('Server message history can preserve a deleted author profile', () => {
    const message = chatMessageSchema.parse({
        attachments: [],
        body: { kind: 'text' },
        author: {
            agentId: 'agt_cove',
            kind: 'agent',
            profile: {
                avatarUrl: '/api/avatars/avt_cove',
                deleted: true,
                description: 'Onboarding Assistant',
                displayName: 'Cove',
            },
        },
        chatId: 'cht_onboarding',
        content: 'Historical guidance.',
        createdAt: '2026-08-10T12:00:00.000Z',
        id: 'msg_cove',
        nonce: 'cove-history',
        runId: null,
        sequence: 1,
        serverId: 'srv_main',
    });

    expect(message.author).toMatchObject({
        kind: 'agent',
        profile: { deleted: true, displayName: 'Cove' },
    });
});

test('Server message contracts admit only human and Agent authors', () => {
    // Every durable Chat message has a human or an Agent author. Agent-only
    // deliveries ride the typed agent inbox, never a Chat row.
    expect(() =>
        chatMessageSchema.parse({
            attachments: [],
            author: { kind: 'system', system: 'session' },
            body: { kind: 'text' },
            chatId: 'cht_all',
            content: 'Session reset.',
            createdAt: '2026-07-26T12:00:00.000Z',
            id: 'msg_session_notice',
            nonce: 'session-notice',
            runId: null,
            sequence: 2,
            serverId: 'srv_main',
        })
    ).toThrow();
});

test('an Agent message carries the session that wrote it', () => {
    const message = chatMessageSchema.parse({
        attachments: [],
        author: { agentId: 'agt_cove', kind: 'agent' },
        body: { kind: 'text' },
        chatId: 'cht_all',
        content: 'Back with a fresh session.',
        createdAt: '2026-07-26T12:00:00.000Z',
        id: 'msg_after_reset',
        nonce: 'after-reset',
        runId: 'run_1',
        sequence: 4,
        serverId: 'srv_main',
        sessionGeneration: 3,
    });
    expect(message.sessionGeneration).toBe(3);
    // A human message says nothing about sessions.
    expect(
        chatMessageSchema.parse({
            attachments: [],
            author: { kind: 'human', userId: 'usr_1' },
            body: { kind: 'text' },
            chatId: 'cht_all',
            content: 'Thanks.',
            createdAt: '2026-07-26T12:00:01.000Z',
            id: 'msg_human',
            nonce: 'human-1',
            runId: null,
            sequence: 5,
            serverId: 'srv_main',
        }).sessionGeneration
    ).toBeNull();
});

test('Chat sends allow attachment-only messages but reject empty messages', () => {
    expect(
        chatSendInputSchema.parse({
            attachmentIds: ['att_one'],
            chatId: 'cht_all',
            content: '',
            nonce: 'send-attachment',
            serverId: 'srv_main',
        })
    ).toMatchObject({ attachmentIds: ['att_one'], content: '' });

    expect(() =>
        chatSendInputSchema.parse({
            attachmentIds: [],
            chatId: 'cht_all',
            content: '   ',
            nonce: 'send-empty',
            serverId: 'srv_main',
        })
    ).toThrow();

    expect(() =>
        chatSendInputSchema.parse({
            attachmentIds: ['att_one', 'att_one'],
            chatId: 'cht_all',
            content: 'Duplicate.',
            nonce: 'send-duplicate',
            serverId: 'srv_main',
        })
    ).toThrow();
});

test('Channel appearance accepts a curated icon name and preset color id, or null', () => {
    const base = { agentIds: ['agt_1'], name: 'planning', serverId: 'srv_main' };

    expect(channelCreateInputSchema.parse(base)).toEqual(base);
    expect(
        channelCreateInputSchema.parse({ ...base, color: 'violet', icon: 'RocketIcon' })
    ).toEqual({ ...base, color: 'violet', icon: 'RocketIcon' });
    expect(
        channelUpdateInputSchema.parse({ ...base, chatId: 'cht_1', color: null, icon: null })
    ).toEqual({ ...base, chatId: 'cht_1', color: null, icon: null });

    expect(() => channelCreateInputSchema.parse({ ...base, color: '#8b5cf6' })).toThrow();
    expect(() => channelCreateInputSchema.parse({ ...base, icon: 'rocket' })).toThrow();
    expect(() =>
        channelCreateInputSchema.parse({ ...base, icon: 'RocketIcon; drop table' })
    ).toThrow();
});
