import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { freshReactions } from './fresh-reactions.ts';
import { threadMessagesQueryKey } from './use-thread-messages.ts';

/** Sends the viewer's reaction to the Server and refreshes both transcript lenses. */
export function useChatMessageReaction(chatId: string) {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();

    return hausTrpc.chat.react.useMutation({
        // An add shows at once as an app-local pending reaction; the rendered
        // pile drops it when the Server's copy arrives.
        onMutate: (input) => {
            if (input.remove) {
                freshReactions.dropPending(input.messageId, input.emoji);
            } else {
                freshReactions.addPending(input.messageId, input.emoji, Date.now());
            }
        },
        onError: (_error, input) => {
            freshReactions.dropPending(input.messageId, input.emoji);
        },
        // The durable event owns cross-client refresh. This ack fallback also
        // repairs the initiating App if its stream is reconnecting.
        onSuccess: (result, input) => {
            const chatIds = [...new Set([chatId, result.message.chatId])];
            for (const affectedChatId of chatIds) {
                void utils.chat.messages.invalidate({
                    chatId: affectedChatId,
                    serverId: input.serverId,
                });
            }
            void queryClient.invalidateQueries({
                queryKey: threadMessagesQueryKey(input.serverId, result.message.chatId),
            });
            void utils.cloudAgentWork.listActive.invalidate({ serverId: input.serverId });
            void utils.chat.search.invalidate({ serverId: input.serverId });
            void utils.task.list.invalidate({ serverId: input.serverId }, { refetchType: 'all' });
        },
    });
}
