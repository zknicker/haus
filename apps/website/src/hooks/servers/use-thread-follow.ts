import { hausTrpc } from '../../lib/haus-server.tsx';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';

/**
 * Follows or unfollows a Thread. `thread.onFollowUpdated` owns the refresh;
 * this ack fallback refreshes the same reads: the chat list and the anchor's
 * entity, whose summary carries the viewer's `followed`.
 */
export function useThreadFollow(anchor: { chatId: string; messageId: string }) {
    const utils = hausTrpc.useUtils();
    const coalescer = useTargetedReadCoalescer();

    return hausTrpc.thread.setFollow.useMutation({
        onSuccess: (_, input) => {
            void utils.chat.list.invalidate({ serverId: input.serverId });
            coalescer.noteMessageAnnotated({ ...anchor, serverId: input.serverId });
        },
    });
}
