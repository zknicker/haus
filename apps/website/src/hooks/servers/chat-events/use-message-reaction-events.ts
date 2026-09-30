import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import { freshReactions } from '../fresh-reactions.ts';
import { threadMessagesQueryKey } from '../use-thread-messages.ts';
import { type ChatEventInvalidation, uniqueChatIds } from './chat-event-invalidation.ts';
import { useChatEvent } from './use-chat-event-stream.tsx';

/**
 * Refetches every message lens affected by a durable reaction change, and
 * marks those messages live so the arriving reaction stamps in.
 */
export function useMessageReactionEvents() {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();

    useChatEvent('message.reaction.updated', async (events, serverId) => {
        const now = Date.now();
        for (const event of events) {
            freshReactions.noteLive(event.messageId, Date.parse(event.createdAt), now);
        }
        await invalidateMessageReactionChanges({ events, queryClient, serverId, utils });
    });
}

export async function invalidateMessageReactionChanges({
    events,
    queryClient,
    serverId,
    utils,
}: ChatEventInvalidation<'message.reaction.updated'>) {
    const messageChatIds = uniqueChatIds(
        events.flatMap((event) =>
            event.parentChatId ? [event.chatId, event.parentChatId] : [event.chatId]
        )
    );
    const threadChatIds = uniqueChatIds(events.map((event) => event.chatId));

    await Promise.all([
        utils.chat.search.invalidate({ serverId }),
        utils.cloudAgentWork.listActive.invalidate({ serverId }),
        ...messageChatIds.map((chatId) => utils.chat.messages.invalidate({ chatId, serverId })),
        utils.task.list.invalidate({ serverId }, { refetchType: 'all' }),
        ...threadChatIds.map((chatId) =>
            queryClient.invalidateQueries({ queryKey: threadMessagesQueryKey(serverId, chatId) })
        ),
    ]);
}
