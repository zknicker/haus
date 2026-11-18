import type { Chat } from '@haus/api';

import { hausTrpc } from '../../lib/haus-server.tsx';

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
