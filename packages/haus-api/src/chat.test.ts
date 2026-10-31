import { expect, test } from 'bun:test';
import {
    channelCreateInputSchema,
    channelUpdateInputSchema,
    chatMessagePageSchema,
    chatMessageSchema,
    chatMessagesInputSchema,
    chatSendInputSchema,
} from './chat.ts';
import {
    chatLifecycleEventSchema,
    chatReadEventSchema,
    messageCreatedEventSchema,
    messageReactionUpdatedEventSchema,
} from './chat-events.ts';
import { chatMessageInputSchema, chatMessageReadSchema } from './chat-message-read.ts';
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

test('Chat reads derive the reader from the authenticated Haus member', () => {
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
        messageId: message.id,
        parentChatId: null,
        replyToAuthorUserId: null,
        sequence: message.sequence,
        serverId: message.serverId,
        threadAnchorAuthorUserId: null,
        threadAnchorMessageId: null,
    });
    expect(created).toMatchObject({ messageId: 'msg_one', sequence: 1 });
    // Events carry ids and facts only: the App reads the row, never a payload copy.
    expect(() => messageCreatedEventSchema.parse({ ...created, message })).toThrow();
    expect(() =>
        messageCreatedEventSchema.parse({ ...created, cursor: '4', type: 'message.created' })
    ).toThrow();
    expect(
        messageReactionUpdatedEventSchema.parse({
            chatId: message.chatId,
            messageId: message.id,
            parentChatId: null,
            serverId: message.serverId,
        })
    ).toEqual({
        chatId: 'cht_all',
        messageId: 'msg_one',
        parentChatId: null,
        serverId: 'srv_main',
    });
    expect(() =>
        messageReactionUpdatedEventSchema.parse({
            chatId: message.chatId,
            messageId: message.id,
            parentChatId: null,
            reactions: message.reactions,
            serverId: message.serverId,
        })
    ).toThrow();
    expect(
        chatLifecycleEventSchema.parse({
            action: 'archived',
            chatId: message.chatId,
            serverId: message.serverId,
        })
    ).toEqual({ action: 'archived', chatId: 'cht_all', serverId: 'srv_main' });
});

test('A Thread reply names its parent and anchor together, never a summary', () => {
    const reply = {
        authorUserId: 'usr_human',
        chatId: 'cht_thread',
        conversationKind: 'channel',
        mentionedUserIds: [],
        messageId: 'msg_reply',
        parentChatId: 'cht_all',
        replyToAuthorUserId: null,
        sequence: 3,
        serverId: 'srv_main',
        threadAnchorAuthorUserId: 'usr_anchor',
        threadAnchorMessageId: 'msg_anchor',
    };
    expect(messageCreatedEventSchema.parse(reply)).toMatchObject({
        threadAnchorMessageId: 'msg_anchor',
    });
    expect(() =>
        messageCreatedEventSchema.parse({ ...reply, threadAnchorMessageId: null })
    ).toThrow();
    expect(() => messageCreatedEventSchema.parse({ ...reply, parentChatId: null })).toThrow();
    expect(() => messageCreatedEventSchema.parse({ ...reply, thread: null })).toThrow();
});

test('A Thread read names its parent and anchor together', () => {
    const read = {
        chatId: 'cht_thread',
        parentChatId: 'cht_all',
        sequence: 3,
        serverId: 'srv_main',
        threadAnchorMessageId: 'msg_anchor',
    };
    expect(chatReadEventSchema.parse(read)).toEqual(read);
    expect(
        chatReadEventSchema.parse({ ...read, parentChatId: null, threadAnchorMessageId: null })
    ).toMatchObject({ threadAnchorMessageId: null });
    expect(() => chatReadEventSchema.parse({ ...read, threadAnchorMessageId: null })).toThrow();
    expect(() => chatReadEventSchema.parse({ ...read, parentChatId: null })).toThrow();
});

test('A message page reports how far its scan reached', () => {
    const page = {
        messages: [],
        nextAfterSequence: null,
        nextBeforeSequence: null,
        scannedThroughSequence: 42,
        threads: [],
    };
    expect(chatMessagePageSchema.parse(page)).toEqual(page);
    const { scannedThroughSequence: _scanned, ...withoutScan } = page;
    expect(() => chatMessagePageSchema.parse(withoutScan)).toThrow();
});

test('chat.message reads one entity with its viewer Thread summary, or null', () => {
    const input = { chatId: 'cht_all', messageId: 'msg_one', serverId: 'srv_main' };
    expect(chatMessageInputSchema.parse(input)).toEqual(input);
    expect(() => chatMessageInputSchema.parse({ ...input, messageIds: ['msg_one'] })).toThrow();
    const message = chatMessageSchema.parse({
        author: { kind: 'human', userId: 'usr_human' },
        body: { kind: 'text' },
        chatId: 'cht_all',
        content: 'Anchor.',
        createdAt: '2026-07-26T12:00:00.000Z',
        id: 'msg_one',
        nonce: 'send-1',
        runId: null,
        sequence: 1,
        serverId: 'srv_main',
    });
    const thread = {
        anchorMessageId: 'msg_one',
        followed: true,
        latestReplyAt: '2026-07-26T12:01:00.000Z',
        recentReplies: [],
        replyCount: 2,
        threadChatId: 'cht_thread',
        unreadCount: 1,
    };
    expect(chatMessageReadSchema.parse({ message, thread })).toMatchObject({
        thread: { unreadCount: 1 },
    });
    expect(chatMessageReadSchema.parse({ message, thread: null })?.thread).toBeNull();
    expect(chatMessageReadSchema.parse(null)).toBeNull();
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
