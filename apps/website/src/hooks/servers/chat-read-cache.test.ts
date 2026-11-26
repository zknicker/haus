import { expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
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
import { withChatRead } from './use-mark-chat-read.ts';

const serverId = 'server_one';

test('a local read through the newest message clears the row at once', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7), row('chat_two', 2, 4)]);

    expect(
        patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils })
    ).toBe(true);

    expect(unread(utils)).toEqual({ chat_one: 0, chat_two: 2 });
});

test('a read short of the newest message, or of an unknown Chat, leaves the list alone', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7)]);

    for (const [chatId, sequence] of [
        ['chat_one', 6],
        ['chat_x', 9],
    ] as const) {
        expect(patchLocalChatRead({ chatId, queryClient, sequence, serverId, utils })).toBe(false);
    }
    expect(unread(utils)).toEqual({ chat_one: 3 });
});

test('a read this client zeroed changes the list, and one the Server zeroed does not', () => {
    const { queryClient, utils } = cache([row('chat_one', 3, 7), row('chat_two', 0, 4)]);
    patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils });

    const changes = (chatId: string) =>
        readChangesUnreadList({ chatId, queryClient, serverId, utils });
    expect(changes('chat_two')).toBe(false);
    expect(changes('chat_one')).toBe(true);
    expect(changes('chat_one')).toBe(false);
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
    const { invalidated, queryClient, utils } = cache([row('chat_one', 3, 7)]);
    patchLocalChatRead({ chatId: 'chat_one', queryClient, sequence: 7, serverId, utils });

    expect(invalidated()).toBe(false);
    settleLocalChatRead({ chatId: 'chat_one', queryClient, serverId, utils });

    expect(invalidated()).toBe(true);
});

test('Mark read zeroes exactly the Chat it reads', () => {
    const chats = [row('chat_one', 3, 7), row('chat_two', 2, 4)];

    expect(withChatRead(chats, 'chat_one').map((chat) => chat.unreadCount)).toEqual([0, 2]);
});

function cache(chats: Chat[]) {
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const client = hausTrpc.createClient({
        links: [httpLink({ url: 'http://read.test' })],
    });
    const utils = createTRPCQueryUtils({ client, queryClient });
    utils.chat.list.setData({ serverId }, chats);
    // No observer mounts here, so an invalidation marks a list without fetching it.
    return {
        invalidated: () =>
            queryClient.getQueryState(utils.chat.list.queryOptions({ serverId }).queryKey)
                ?.isInvalidated ?? false,
        queryClient,
        utils,
    };
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
        captainChat: null,
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
