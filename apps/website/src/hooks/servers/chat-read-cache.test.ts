import { expect, test } from 'bun:test';
import type { Chat, ChatMessage } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryClientDefaultOptions } from '../../lib/query-policy.ts';
import { chatMessageQueryKey, seedChatMessageEntities } from './chat-message-entities.ts';
import { toTranscriptPage } from './chat-message-layout.ts';
import { chatReadChangesList, patchLocalChatRead, settleLocalChatRead } from './chat-read-cache.ts';
import { chatMessagesQueryKey } from './use-chat-messages.ts';

const serverId = 'server_one';

test('a local read through the newest message clears the row at once', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7), row('chat_two', 2, 4)]);
    transcript(queryClient, 'chat_one');

    expect(
        patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils })
    ).toBe(true);

    expect(unread(utils)).toEqual({ chat_one: 0, chat_two: 2 });
});

test('a read short of the newest message, or of an unknown Chat, leaves the list alone', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7)]);

    expect(
        patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 6, serverId, utils })
    ).toBe(false);
    expect(
        patchLocalChatRead({ chatId: 'thread_x', queryClient, sequence: 9, serverId, utils })
    ).toBe(false);
    expect(unread(utils)).toEqual({ chat_one: 3 });
});

test('a Chat that may hold unread Thread replies keeps its count until the Server answers', () => {
    // The row's 3 may include followed Thread replies a Chat read leaves unread,
    // so zeroing it early could flash a wrong badge.
    const unreadThread = cache([row('chat_one', 3, 7)]);
    transcript(unreadThread.queryClient, 'chat_one', { threadUnread: 2 });
    const olderHistory = cache([row('chat_one', 3, 7)]);
    transcript(olderHistory.queryClient, 'chat_one', { olderHistory: true });
    const behind = cache([row('chat_one', 3, 7)]);
    transcript(behind.queryClient, 'chat_one');
    void behind.queryClient.invalidateQueries({
        queryKey: chatMessagesQueryKey(serverId, 'chat_one'),
        refetchType: 'none',
    });
    const uncached = cache([row('chat_one', 3, 7)]);

    for (const { queryClient, utils } of [unreadThread, olderHistory, behind, uncached]) {
        expect(
            patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils })
        ).toBe(false);
        expect(unread(utils)).toEqual({ chat_one: 3 });
    }
});

test('a read this client zeroed changes the list, and one the Server zeroed does not', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7), row('chat_two', 0, 4)]);
    transcript(queryClient, 'chat_one');
    patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils });

    // The Server's own zero: a read can only lower counts, so nothing changes.
    expect(chatReadChangesList({ queryClient, rowIds: ['chat_two'], serverId, utils })).toBe(false);
    // The local zero is a guess (followed Thread replies roll into the count), so it confirms.
    expect(chatReadChangesList({ queryClient, rowIds: ['chat_one'], serverId, utils })).toBe(true);
});

test('a Thread read answers for its unread parent row', () => {
    const { queryClient, utils } = cache([row('chat_one', 2, 7)]);

    expect(chatReadChangesList({ queryClient, rowIds: ['chat_one'], serverId, utils })).toBe(true);
});

test('an anchor entity behind the Server keeps the count until the Server answers', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7)]);
    transcript(queryClient, 'chat_one');
    void queryClient.invalidateQueries({
        queryKey: chatMessageQueryKey(serverId, 'chat_one', 'msg_anchor'),
        refetchType: 'none',
    });

    expect(
        patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils })
    ).toBe(false);
});

test('a list read in flight cannot land the old count over a local read', async () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7)]);
    transcript(queryClient, 'chat_one');
    let landStaleList = () => {};
    const inFlight = queryClient.fetchQuery({
        queryFn: () =>
            new Promise<Chat[]>((resolve) => {
                // The Server answered before this client's read reached it.
                landStaleList = () => resolve([row('chat_one', 3, 7)]);
            }),
        queryKey: utils.chat.list.queryOptions({ serverId }).queryKey,
        staleTime: 0,
    });

    patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils });
    landStaleList();
    await inFlight.catch(() => undefined);

    expect(unread(utils)).toEqual({ chat_one: 0 });
});

test('a local read whose event never came refetches once it settles', () => {
    const { queryClient, refetches, utils } = cache([row('chat_one', 3, 7)]);
    transcript(queryClient, 'chat_one');
    patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils });

    settleLocalChatRead({ chatId: 'chat_one', queryClient, serverId, utils });
    settleLocalChatRead({ chatId: 'chat_one', queryClient, serverId, utils });

    expect(refetches()).toBe(1);
});

function cache(chats: Chat[]) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const client = hausTrpc.createClient({
        links: [httpLink({ url: 'http://read.test' })],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.chat.list.setData({ serverId }, chats);
    return {
        queryClient,
        // No observer mounts here, so an invalidation marks the list without fetching it.
        refetches: () =>
            queryClient.getQueryState(utils.chat.list.queryOptions({ serverId }).queryKey)
                ?.isInvalidated
                ? 1
                : 0,
        utils,
    };
}

function transcript(
    queryClient: QueryClient,
    chatId: string,
    { olderHistory = false, threadUnread = 0 } = {}
) {
    const anchor: ChatMessage = {
        attachments: [],
        author: { kind: 'human', userId: 'usr_reader' },
        body: { kind: 'text' },
        chatId,
        content: 'Anchor',
        createdAt: '2026-01-01T00:00:00Z',
        id: 'msg_anchor',
        nonce: 'nonce_anchor',
        reactions: [],
        reply: null,
        runId: null,
        sequence: 7,
        serverId,
        sessionGeneration: null,
    };
    const page = {
        messages: [anchor],
        nextAfterSequence: null,
        nextBeforeSequence: olderHistory ? 3 : null,
        scannedThroughSequence: 7,
        threads: [
            {
                anchorMessageId: 'msg_anchor',
                followed: true,
                latestReplyAt: null,
                recentReplies: [],
                replyCount: 2,
                threadChatId: 'thread_one',
                unreadCount: threadUnread,
            },
        ],
    };
    seedChatMessageEntities(queryClient, page);
    queryClient.setQueryData(chatMessagesQueryKey(serverId, chatId), {
        pageParams: [undefined],
        pages: [toTranscriptPage(page)],
    });
}

function unread(utils: ReturnType<typeof cache>['utils']) {
    return Object.fromEntries(
        (utils.chat.list.getData({ serverId }) ?? []).map((chat) => [chat.id, chat.unreadCount])
    );
}

function row(id: string, unreadCount: number, lastMessageSequence: number): Chat {
    return {
        archivedAt: null,
        archivedByUserId: null,
        color: null,
        createdAt: '2026-01-01T00:00:00Z',
        description: null,
        icon: null,
        id,
        isAll: false,
        kind: 'channel',
        lastActivityAt: null,
        lastMessage: null,
        lastMessageSequence,
        name: id,
        participantAgentIds: [],
        participantUserIds: [],
        peerAgentDisplayName: null,
        peerAgentId: null,
        peerAgentRetired: false,
        peerUserId: null,
        serverId,
        unreadCount,
    };
}
