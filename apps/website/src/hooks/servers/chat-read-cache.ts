import type { QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';

type ReadUtils = Pick<ReturnType<typeof hausTrpc.useUtils>, 'chat'>;

/**
 * How long a local read waits for its own `chat.read` event before refetching
 * the list itself: a read the Server found already done emits no event.
 */
export const localReadSettleMs = 1000;

// Rows this client cleared ahead of the Server, per cache, until a refetch confirms them.
const pendingReads = new WeakMap<QueryClient, Set<string>>();

/**
 * Viewing a Chat through its newest message clears its unread row at once:
 * its sidebar chip and Inbox row (`chat.list`). A read through the newest
 * message is the Server's answer. A read short of it leaves the row to the
 * `chat.read` event's refetch. Runs before the request leaves, so that event
 * finds the row pending and still confirms it.
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
    if (!(chats && chat && chat.unreadCount > 0 && sequence >= chat.lastMessageSequence)) {
        return false;
    }
    // A list read already in flight predates this read and would land the old
    // count back. Cancelling reverts it synchronously; the pending mark below
    // forces the follow-up refetch that replaces it.
    void queryClient.cancelQueries({ queryKey: listQueryKey(serverId) });
    utils.chat.list.setData(
        key,
        chats.map((entry) => (entry.id === chatId ? { ...entry, unreadCount: 0 } : entry))
    );
    pending(queryClient).add(readKey(serverId, chatId));
    return true;
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
    if (pending(queryClient).delete(readKey(serverId, chatId))) {
        void utils.chat.list.invalidate({ serverId });
    }
}

/**
 * Whether a read of this Chat can change `chat.list`. A read only lowers
 * unread state, so a settled list that already shows the row read — and not
 * cleared ahead of the Server by this client — needs no refetch. Anything
 * unknown (no list, a fetch in flight) refetches. Clears the pending mark it
 * answers for.
 */
export function readChangesUnreadList({
    chatId,
    queryClient,
    serverId,
    utils,
}: {
    chatId: string;
    queryClient: QueryClient;
    serverId: string;
    utils: ReadUtils;
}): boolean {
    if (pending(queryClient).delete(readKey(serverId, chatId))) {
        return true;
    }
    if (queryClient.isFetching({ queryKey: listQueryKey(serverId) }) > 0) {
        return true;
    }
    const chats = utils.chat.list.getData({ serverId });
    return !chats || (chats.find((chat) => chat.id === chatId)?.unreadCount ?? 1) > 0;
}

function listQueryKey(serverId: string) {
    return getQueryKey(hausTrpc.chat.list, { serverId }, 'query');
}

function pending(queryClient: QueryClient): Set<string> {
    let marks = pendingReads.get(queryClient);
    if (!marks) {
        marks = new Set();
        pendingReads.set(queryClient, marks);
    }
    return marks;
}

function readKey(serverId: string, chatId: string) {
    return `${serverId}:${chatId}`;
}
