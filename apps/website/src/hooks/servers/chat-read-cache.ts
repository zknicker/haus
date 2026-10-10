import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { type ChatMessageEntry, chatMessageQueryKey } from './chat-message-entities.ts';
import type { TranscriptPage } from './chat-message-layout.ts';
import { chatMessagesQueryKey } from './use-chat-messages.ts';

type ListUtils = Pick<ReturnType<typeof hausTrpc.useUtils>, 'chat'>;

/**
 * How long a local read waits for its own `chat.read` event before refetching
 * the list itself: a read the Server found already done emits no event.
 */
export const localReadSettleMs = 1000;

// Rows this client zeroed ahead of the Server, per cache, until a refetch confirms them.
const pendingReads = new WeakMap<QueryClient, Set<string>>();

/**
 * Viewing a Chat through its newest message clears its sidebar unread chip at
 * once — but only when that is provably the Server's answer. `unreadCount`
 * also rolls up followed or mentioning Thread replies, which a Chat read does
 * not clear, and the list row carries no split; so the chip clears early only
 * when the settled transcript cache holds the whole Chat and none of its
 * Threads has an unread reply. Otherwise the `chat.read` event's refetch moves
 * it. Runs before the request leaves, so that event finds the row pending and
 * still confirms the count.
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
    utils: ListUtils;
}): boolean {
    const chats = utils.chat.list.getData({ serverId });
    const row = chats?.find((chat) => chat.id === chatId);
    if (
        !(chats && row) ||
        row.unreadCount === 0 ||
        sequence < row.lastMessageSequence ||
        !threadRepliesAllRead(queryClient, serverId, chatId)
    ) {
        return false;
    }
    // A list read already in flight predates this read and would land the old
    // count back. Cancelling reverts it synchronously; the pending mark below
    // forces the follow-up refetch that replaces it.
    void queryClient.cancelQueries({ queryKey: chatListQueryKey(serverId) });
    utils.chat.list.setData(
        { serverId },
        chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat))
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
    utils: ListUtils;
}) {
    if (pending(queryClient).delete(readKey(serverId, chatId))) {
        void utils.chat.list.invalidate({ serverId });
    }
}

/**
 * Whether reads of these list rows can change `chat.list`. A read only lowers
 * unread counts, so a settled list already showing zero for every row — and
 * not zeroed ahead of the Server by this client — needs no refetch. Anything
 * unknown (no list, a row missing, a fetch in flight) refetches. Clears the
 * pending marks it answers for.
 */
export function chatReadChangesList({
    queryClient,
    rowIds,
    serverId,
    utils,
}: {
    queryClient: QueryClient;
    rowIds: readonly string[];
    serverId: string;
    utils: ListUtils;
}): boolean {
    const marks = pending(queryClient);
    const wasPending = rowIds.map((rowId) => marks.delete(readKey(serverId, rowId)));
    if (wasPending.some(Boolean)) {
        return true;
    }
    const chats = utils.chat.list.getData({ serverId });
    if (!chats || queryClient.isFetching({ queryKey: chatListQueryKey(serverId) }) > 0) {
        return true;
    }
    return rowIds.some((rowId) => (chats.find((chat) => chat.id === rowId)?.unreadCount ?? 1) > 0);
}

/**
 * Whether the cached transcript proves no Thread reply in this Chat is unread:
 * every listed message's entity is settled and its summary shows none.
 */
function threadRepliesAllRead(queryClient: QueryClient, serverId: string, chatId: string) {
    const state = queryClient.getQueryState<InfiniteData<TranscriptPage>>(
        chatMessagesQueryKey(serverId, chatId)
    );
    // A pending refetch or an event's invalidation means the summaries may be behind.
    if (!isSettled(state)) {
        return false;
    }
    const { pages } = state.data;
    // Unloaded older history can anchor Threads this cache has never seen.
    if (pages.at(-1)?.nextBeforeSequence !== null) {
        return false;
    }
    return pages.every((page) =>
        page.entries.every((entry) => {
            const entity = queryClient.getQueryState<ChatMessageEntry>(
                chatMessageQueryKey(serverId, chatId, entry.id)
            );
            return isSettled(entity) && (entity.data?.thread?.unreadCount ?? 0) === 0;
        })
    );
}

function isSettled<Data>(
    state:
        | {
              data: Data | undefined;
              fetchStatus: string;
              isInvalidated: boolean;
          }
        | undefined
): state is { data: Data; fetchStatus: string; isInvalidated: boolean } {
    return state?.data !== undefined && !state.isInvalidated && state.fetchStatus === 'idle';
}

function chatListQueryKey(serverId: string) {
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
