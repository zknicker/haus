import type { Chat, ChatMarkReadInput, UnreadThreadList } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * The Inbox's Mark read: reads one Chat or Thread through its newest message
 * (`chat.markRead`), on purpose rather than by viewing it. A Chat row passes
 * `includeThreads`, which reads every Thread under it too (ADR 0042).
 *
 * The rows leave at once — the Chat's unread count drops to zero in the
 * cached `chat.list`, and its Thread rows (or the one Thread) drop out of the
 * cached `thread.listUnread` — and the Server reconciles them: the
 * reader-scoped `chat.read` events refetch the lists, and so does this
 * mutation's own settle, which repairs a client whose stream is reconnecting.
 * A failure puts the previous lists back.
 */
export function useMarkChatRead() {
    const utils = hausTrpc.useUtils();

    return hausTrpc.chat.markRead.useMutation({
        onMutate: async (input) => {
            const key = { serverId: input.serverId };
            await Promise.all([utils.chat.list.cancel(key), utils.thread.listUnread.cancel(key)]);
            const previous = {
                chats: utils.chat.list.getData(key),
                threads: utils.thread.listUnread.getData(key),
            };
            utils.chat.list.setData(key, (chats) =>
                chats ? withChatRead(chats, input.chatId) : chats
            );
            utils.thread.listUnread.setData(key, (list) =>
                list ? withThreadsRead(list, input) : list
            );
            return { previous };
        },
        onError: (_error, input, context) => {
            if (context) {
                const key = { serverId: input.serverId };
                utils.chat.list.setData(key, context.previous.chats);
                utils.thread.listUnread.setData(key, context.previous.threads);
            }
        },
        onSettled: (_result, _error, input) => {
            const key = { serverId: input.serverId };
            void utils.chat.list.invalidate(key);
            void utils.thread.listUnread.invalidate(key);
        },
    });
}

/** The list with one Chat read, as the Server will report it. */
export function withChatRead(chats: readonly Chat[], chatId: string): Chat[] {
    return chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat));
}

/** The unread Threads left once this read lands: the Thread itself, or a Chat's with `includeThreads`. */
export function withThreadsRead(
    list: UnreadThreadList,
    input: Pick<ChatMarkReadInput, 'chatId' | 'includeThreads'>
): UnreadThreadList {
    return {
        threads: list.threads.filter(
            (thread) =>
                thread.threadChatId !== input.chatId &&
                !(input.includeThreads && thread.parentChatId === input.chatId)
        ),
    };
}
