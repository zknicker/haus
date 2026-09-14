import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { threadMessagesQueryKey } from '../use-thread-messages.ts';
import { type ChatEventInvalidation, uniqueChatIds } from './chat-event-invalidation.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * A new message moves the transcript it landed in, the Thread transcript of the
 * same Chat, its parent summary when it is a Thread reply, Chat ordering, and
 * Server search.
 */
export function useMessageCreatedEvents() {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();

    useChatEvent('message.created', async (events, serverId) => {
        await invalidateMessageCreated({ events, queryClient, serverId, utils });
    });
}

export async function invalidateMessageCreated({
    events,
    queryClient,
    serverId,
    utils,
}: ChatEventInvalidation<'message.created'>) {
    const messageChatIds = uniqueChatIds(
        events.flatMap((event) =>
            event.parentChatId ? [event.chatId, event.parentChatId] : [event.chatId]
        )
    );
    const threadChatIds = uniqueChatIds(events.map((event) => event.chatId));

    // Inactive reads are not refetched by invalidation. Cancel older requests
    // first so their late responses cannot erase the stale mark before remount.
    await Promise.all([
        ...messageChatIds.map((chatId) => utils.chat.messages.cancel({ chatId, serverId })),
        ...threadChatIds.map((chatId) =>
            queryClient.cancelQueries({ queryKey: threadMessagesQueryKey(serverId, chatId) })
        ),
    ]);

    await Promise.all([
        utils.chat.list.invalidate({ serverId }),
        utils.chat.search.invalidate({ serverId }),
        ...messageChatIds.map((chatId) => utils.chat.messages.invalidate({ chatId, serverId })),
        ...threadChatIds.map((chatId) =>
            queryClient.invalidateQueries({ queryKey: threadMessagesQueryKey(serverId, chatId) })
        ),
    ]);
}
