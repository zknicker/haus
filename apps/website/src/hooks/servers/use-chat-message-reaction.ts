import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { freshReactions } from './fresh-reactions.ts';

/** Sends the viewer's reaction to the Server and refreshes the message's entity. */
export function useChatMessageReaction() {
    const utils = hausTrpc.useUtils();
    const coalescer = useTargetedReadCoalescer();

    return hausTrpc.chat.react.useMutation({
        // An add shows at once as an app-local pending reaction; the rendered
        // pile drops it when the Server's copy arrives. Nothing writes the
        // entity, so a concurrent realtime refresh is never rolled back.
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
        // `chat.onMessageReactionUpdated` owns cross-client refresh. This ack
        // fallback also repairs the initiating App if its stream is restarting.
        onSuccess: (result, input) => {
            coalescer.noteMessageAnnotated({
                chatId: result.message.chatId,
                messageId: result.message.id,
                serverId: input.serverId,
            });
            void utils.cloudAgentWork.listActive.invalidate({ serverId: input.serverId });
            void utils.chat.search.invalidate({ serverId: input.serverId });
            void utils.task.list.invalidate({ serverId: input.serverId }, { refetchType: 'all' });
        },
    });
}
