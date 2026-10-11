import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';

type ReadUtils = Pick<ReturnType<typeof hausTrpc.useUtils>, 'chat' | 'thread'>;

/** Which unread list a read lowers: a Chat's `chat.list` row, or a Thread's `thread.listUnread` row. */
type UnreadList = 'chats' | 'threads';

/**
 * How long a local read waits for its own `chat.read` event before refetching
 * the list itself: a read the Server found already done emits no event.
 */
export const localReadSettleMs = 1000;

// Rows this client cleared ahead of the Server, per cache, until a refetch confirms them.
const pendingReads = new WeakMap<QueryClient, Set<string>>();

/**
 * Viewing a Chat or Thread through its newest message clears its unread row
 * at once: a Chat's sidebar chip and Inbox row (`chat.list`), or a Thread's
 * Inbox row (`thread.listUnread`). Each counts only its own messages
 * (ADR 0042), so a read through the newest message is the Server's answer. A
 * read short of it leaves the row to the `chat.read` event's refetch. Runs
 * before the request leaves, so that event finds the row pending and still
 * confirms it.
 */
export function patchLocalChatRead({
    chatId,
    queryClient,
    sequence,
    serverId,
    utils,
}: {
    chatId: string;
    queryClient: QueryClient;
    sequence: number;
    serverId: string;
    utils: ReadUtils;
}): boolean {
    const key = { serverId };
    const chats = utils.chat.list.getData(key);
    const chat = chats?.find((entry) => entry.id === chatId);
    if (chats && chat && chat.unreadCount > 0 && sequence >= chat.lastMessageSequence) {
        // A list read already in flight predates this read and would land the old
        // count back. Cancelling reverts it synchronously; the pending mark below
        // forces the follow-up refetch that replaces it.
        void queryClient.cancelQueries({ queryKey: listQueryKey('chats', serverId) });
        utils.chat.list.setData(
            key,
            chats.map((entry) => (entry.id === chatId ? { ...entry, unreadCount: 0 } : entry))
        );
        pending(queryClient).add(readKey('chats', serverId, chatId));
        return true;
    }
    const list = utils.thread.listUnread.getData(key);
    const thread = list?.threads.find((entry) => entry.threadChatId === chatId);
    if (list && thread && sequence >= thread.lastMessageSequence) {
        void queryClient.cancelQueries({ queryKey: listQueryKey('threads', serverId) });
        utils.thread.listUnread.setData(key, {
            threads: list.threads.filter((entry) => entry.threadChatId !== chatId),
        });
        pending(queryClient).add(readKey('threads', serverId, chatId));
        return true;
    }
    return false;
}

/** The backstop for a local read whose event never came: refetch if still unconfirmed. */
export function settleLocalChatRead({
    chatId,
    queryClient,
    serverId,
    utils,
}: {
    chatId: string;
    queryClient: QueryClient;
    serverId: string;
    utils: ReadUtils;
}) {
    const marks = pending(queryClient);
    if (marks.delete(readKey('chats', serverId, chatId))) {
        void utils.chat.list.invalidate({ serverId });
    }
    if (marks.delete(readKey('threads', serverId, chatId))) {
        void utils.thread.listUnread.invalidate({ serverId });
    }
}

/**
 * Whether a read of this Chat (`chats`) or Thread (`threads`) can change its
 * unread list. A read only lowers unread state, so a settled list that already
 * shows the row read — and not cleared ahead of the Server by this client —
 * needs no refetch. Anything unknown (no list, a fetch in flight) refetches.
 * Clears the pending mark it answers for.
 */
export function readChangesUnreadList({
    chatId,
    list,
    queryClient,
    serverId,
    utils,
}: {
    chatId: string;
    list: UnreadList;
    queryClient: QueryClient;
    serverId: string;
    utils: ReadUtils;
}): boolean {
    if (pending(queryClient).delete(readKey(list, serverId, chatId))) {
        return true;
    }
    if (queryClient.isFetching({ queryKey: listQueryKey(list, serverId) }) > 0) {
        return true;
    }
    if (list === 'chats') {
        const chats = utils.chat.list.getData({ serverId });
        return !chats || (chats.find((chat) => chat.id === chatId)?.unreadCount ?? 1) > 0;
    }
    const threads = utils.thread.listUnread.getData({ serverId })?.threads;
    return !threads || threads.some((thread) => thread.threadChatId === chatId);
}

function listQueryKey(list: UnreadList, serverId: string) {
    return list === 'chats'
        ? getQueryKey(hausTrpc.chat.list, { serverId }, 'query')
        : getQueryKey(hausTrpc.thread.listUnread, { serverId }, 'query');
}

function pending(queryClient: QueryClient): Set<string> {
    let marks = pendingReads.get(queryClient);
    if (!marks) {
        marks = new Set();
        pendingReads.set(queryClient, marks);
    }
    return marks;
}

function readKey(list: UnreadList, serverId: string, chatId: string) {
    return `${list}:${serverId}:${chatId}`;
}
