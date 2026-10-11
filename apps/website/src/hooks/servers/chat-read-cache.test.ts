import { expect, test } from 'bun:test';
import type { Chat, UnreadThread } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { createTRPCQueryUtils } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryClientDefaultOptions } from '../../lib/query-policy.ts';
import {
    patchLocalChatRead,
    readChangesUnreadList,
    settleLocalChatRead,
} from './chat-read-cache.ts';
import { withThreadsRead } from './use-mark-chat-read.ts';

const serverId = 'server_one';

test('a local read through the newest message clears the row at once', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7), row('chat_two', 2, 4)]);

    expect(
        patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils })
    ).toBe(true);

    expect(unread(utils)).toEqual({ chat_one: 0, chat_two: 2 });
});

test('a Chat read clears the Chat while its Threads stay unread on their own', () => {
    // ADR 0043: the row counts only the Chat's own messages, so no Thread state holds it back.
    const { queryClient, utils } = cache(
        [row('chat_one', 3, 7)],
        [thread('thread_one', 'chat_one', 4)]
    );

    expect(
        patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils })
    ).toBe(true);

    expect(unread(utils)).toEqual({ chat_one: 0 });
    expect(unreadThreads(utils)).toEqual(['thread_one']);
});

test('a read short of the newest message, or of an unknown Chat, leaves the lists alone', () => {
    const { queryClient, utils } = cache(
        [row('chat_one', 3, 7)],
        [thread('thread_one', 'chat_one', 4)]
    );

    for (const [chatId, sequence] of [
        ['chat_one', 6],
        ['thread_one', 3],
        ['thread_x', 9],
    ] as const) {
        expect(patchLocalChatRead({ chatId, queryClient, sequence, serverId, utils })).toBe(false);
    }
    expect(unread(utils)).toEqual({ chat_one: 3 });
    expect(unreadThreads(utils)).toEqual(['thread_one']);
});

test('viewing a Thread through its newest reply drops its Inbox row at once', () => {
    const { queryClient, utils } = cache(
        [row('chat_one', 0, 7)],
        [thread('thread_one', 'chat_one', 4), thread('thread_two', 'chat_one', 2)]
    );

    expect(
        patchLocalChatRead({ chatId: 'thread_one', queryClient, sequence: 4, serverId, utils })
    ).toBe(true);

    expect(unreadThreads(utils)).toEqual(['thread_two']);
    // The local drop is a guess until the Server's read confirms it.
    expect(
        readChangesUnreadList({
            chatId: 'thread_one',
            list: 'threads',
            queryClient,
            serverId,
            utils,
        })
    ).toBe(true);
    expect(
        readChangesUnreadList({
            chatId: 'thread_one',
            list: 'threads',
            queryClient,
            serverId,
            utils,
        })
    ).toBe(false);
});

test('a read this client zeroed changes the list, and one the Server zeroed does not', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7), row('chat_two', 0, 4)]);
    patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils });

    const changes = (chatId: string) =>
        readChangesUnreadList({ chatId, list: 'chats', queryClient, serverId, utils });
    expect(changes('chat_two')).toBe(false);
    expect(changes('chat_one')).toBe(true);
});

test('a Thread read changes the Thread list only while it lists that Thread', () => {
    const listed = cache([], [thread('thread_one', 'chat_one', 4)]);
    const uncached = cache([]);
    const changes = ({ queryClient, utils }: ReturnType<typeof cache>, chatId: string) =>
        readChangesUnreadList({ chatId, list: 'threads', queryClient, serverId, utils });

    expect(changes(listed, 'thread_one')).toBe(true);
    expect(changes(listed, 'thread_read')).toBe(false);
    expect(changes(uncached, 'thread_one')).toBe(true);
});

test('a list read in flight cannot land the old count over a local read', async () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7)]);
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

test('a local read whose event never came refetches its own list once it settles', () => {
    const { invalidated, queryClient, utils } = cache(
        [row('chat_one', 3, 7)],
        [thread('thread_one', 'chat_one', 4)]
    );
    patchLocalChatRead({ chatId: 'thread_one', queryClient, sequence: 4, serverId, utils });

    settleLocalChatRead({ chatId: 'thread_one', queryClient, serverId, utils });
    settleLocalChatRead({ chatId: 'thread_one', queryClient, serverId, utils });

    expect(invalidated()).toEqual({ chats: false, threads: true });
});

test('Mark read drops the Thread itself, or every Thread under a Chat read with them', () => {
    const list = {
        threads: [
            thread('thread_one', 'chat_one', 4),
            thread('thread_two', 'chat_one', 2),
            thread('thread_three', 'chat_two', 5),
        ],
    };
    const ids = (next: { threads: UnreadThread[] }) => next.threads.map((t) => t.threadChatId);

    expect(ids(withThreadsRead(list, { chatId: 'thread_two' }))).toEqual([
        'thread_one',
        'thread_three',
    ]);
    expect(ids(withThreadsRead(list, { chatId: 'chat_one', includeThreads: true }))).toEqual([
        'thread_three',
    ]);
    expect(ids(withThreadsRead(list, { chatId: 'chat_one' }))).toEqual(ids(list));
});

function cache(chats: Chat[], threads?: UnreadThread[]) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const client = hausTrpc.createClient({
        links: [httpLink({ url: 'http://read.test' })],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.chat.list.setData({ serverId }, chats);
    if (threads) {
        utils.thread.listUnread.setData({ serverId }, { threads });
    }
    // No observer mounts here, so an invalidation marks a list without fetching it.
    const isInvalidated = (queryKey: readonly unknown[]) =>
        queryClient.getQueryState(queryKey)?.isInvalidated ?? false;
    return {
        invalidated: () => ({
            chats: isInvalidated(utils.chat.list.queryOptions({ serverId }).queryKey),
            threads: isInvalidated(utils.thread.listUnread.queryOptions({ serverId }).queryKey),
        }),
        queryClient,
        utils,
    };
}

function unread(utils: ReturnType<typeof cache>['utils']) {
    return Object.fromEntries(
        (utils.chat.list.getData({ serverId }) ?? []).map((chat) => [chat.id, chat.unreadCount])
    );
}

function unreadThreads(utils: ReturnType<typeof cache>['utils']) {
    return (utils.thread.listUnread.getData({ serverId })?.threads ?? []).map(
        (entry) => entry.threadChatId
    );
}

function thread(
    threadChatId: string,
    parentChatId: string,
    lastMessageSequence: number
): UnreadThread {
    return {
        anchorMessageId: `msg_${threadChatId}`,
        firstUnreadMessageId: `msg_first_${threadChatId}`,
        firstUnreadSequence: 1,
        lastActivityAt: null,
        lastMessageSequence,
        latestReply: null,
        parentChatId,
        serverId,
        threadChatId,
        unreadCount: 1,
    };
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
