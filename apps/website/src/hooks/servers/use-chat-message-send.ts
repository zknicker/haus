import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';

export function useChatMessageSend() {
    const coalescer = useTargetedReadCoalescer();

    return hausTrpc.chat.send.useMutation({
        // `chat.onMessageCreated` owns the transcript response for a send. This
        // is only the sender's ack fallback for when that event is slow: the
        // same idempotent tail read (and, for a Thread reply, the anchor's
        // summary). Never awaited: the composer has already cleared and the
        // transcript's pending row is carrying the message.
        onSuccess: (result, input) => {
            const { message } = result;
            coalescer.requestTail({
                chatId: message.chatId,
                sequence: message.sequence,
                serverId: message.serverId,
            });
            if ('chatId' in input && input.thread) {
                coalescer.noteMessageAnnotated({
                    chatId: input.chatId,
                    messageId: input.thread.anchorMessageId,
                    serverId: input.serverId,
                });
            }
        },
    });
}
