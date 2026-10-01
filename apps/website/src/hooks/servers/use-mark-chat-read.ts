import type { Chat } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * The Inbox's Mark read: reads one Chat through its newest message, with the
 * Thread replies it rolls up (`chat.markRead` with `includeThreads`), on
 * purpose rather than by viewing it.
 *
 * The row leaves at once — the Chat's unread count drops to zero in the
 * cached `chat.list` — and the Server reconciles it: the reader-scoped
 * `chat.read` events refetch the list, and so does this mutation's own
 * settle, which repairs a client whose stream is reconnecting. A failure puts
 * the previous list back.
 */
export function useMarkChatRead() {
    const utils = hausTrpc.useUtils();

    return hausTrpc.chat.markRead.useMutation({
        onMutate: async (input) => {
            const key = { serverId: input.serverId };
            await utils.chat.list.cancel(key);
            const previous = utils.chat.list.getData(key);
            utils.chat.list.setData(key, (chats) =>
                chats ? withChatRead(chats, input.chatId) : chats
            );
            return { previous };
        },
        onError: (_error, input, context) => {
            if (context) {
                utils.chat.list.setData({ serverId: input.serverId }, context.previous);
            }
        },
        onSettled: (_result, _error, input) => {
            void utils.chat.list.invalidate({ serverId: input.serverId });
        },
    });
}

/** The list with one Chat read, as the Server will report it. */
export function withChatRead(chats: readonly Chat[], chatId: string): Chat[] {
    return chats.map((chat) => (chat.id === chatId ? { ...chat, unreadCount: 0 } : chat));
}
