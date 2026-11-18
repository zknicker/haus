import { expect, test } from 'bun:test';

import {
    chatLifecycleEventSchema,
    chatReadEventSchema,
    messageCreatedEventSchema,
    messageReactionUpdatedEventSchema,
} from './chat-events.ts';
import { chatMessageInputSchema, chatMessageReadSchema } from './chat-message-read.ts';
import { chatMarkReadInputSchema } from './chat-read.ts';
import {
    channelCreateInputSchema,
    channelUpdateInputSchema,
    chatMessagePageSchema,
    chatMessageSchema,
    chatMessagesInputSchema,
    chatSendInputSchema,
} from './chat.ts';

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
        replyToAuthorUserId: null,
        sequence: message.sequence,
        serverId: message.serverId,
        taskId: null,
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
            serverId: message.serverId,
        })
    ).toEqual({
        chatId: 'cht_all',
        messageId: 'msg_one',
        serverId: 'srv_main',
    });
    expect(() =>
        messageReactionUpdatedEventSchema.parse({
            chatId: message.chatId,
            messageId: message.id,
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

test('A Task message and a Task read name the Task, and nothing names a parent anchor', () => {
    const created = {
        authorUserId: 'usr_human',
        chatId: 'cht_task',
        conversationKind: 'channel' as const,
        mentionedUserIds: [],
        messageId: 'msg_reply',
        replyToAuthorUserId: null,
        sequence: 3,
        serverId: 'srv_main',
        taskId: 'tsk_one',
    };
    expect(messageCreatedEventSchema.parse(created)).toEqual(created);
    expect(() =>
        messageCreatedEventSchema.parse({ ...created, parentChatId: 'cht_all' })
    ).toThrow();
    const read = { chatId: 'cht_task', sequence: 3, serverId: 'srv_main', taskId: 'tsk_one' };
    expect(chatReadEventSchema.parse(read)).toEqual(read);
    expect(() => chatReadEventSchema.parse({ ...read, parentChatId: 'cht_all' })).toThrow();
});

test('A message page reports how far its scan reached', () => {
    const page = {
        messages: [],
        nextAfterSequence: null,
        nextBeforeSequence: null,
        scannedThroughSequence: 42,
        tasks: [],
    };
    expect(chatMessagePageSchema.parse(page)).toEqual(page);
    const { scannedThroughSequence: _scanned, ...withoutScan } = page;
    expect(() => chatMessagePageSchema.parse(withoutScan)).toThrow();
});

test('chat.message reads one entity with its Task previews, or null', () => {
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
    expect(chatMessageReadSchema.parse({ message })).toEqual({ message, tasks: [] });
    expect(() => chatMessageReadSchema.parse({ message, thread: null })).toThrow();
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
