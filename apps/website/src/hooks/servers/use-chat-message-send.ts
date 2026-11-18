import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';

export function useChatMessageSend() {
    const coalescer = useTargetedReadCoalescer();

    return hausTrpc.chat.send.useMutation({
        // `chat.onMessageCreated` owns the transcript response for a send. This
        // is only the sender's ack fallback for when that event is slow: the
        // same idempotent tail read. Never awaited: the composer has already
        // cleared and the transcript's pending row is carrying the message.
        onSuccess: ({ message }) => {
            coalescer.requestTail({
                chatId: message.chatId,
                sequence: message.sequence,
                serverId: message.serverId,
            });
        },
    });
}
