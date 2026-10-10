import type { ThreadFollowUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `thread.onFollowUpdated` (the viewer's own follows): the anchor's summary
 * carries `followed`, and follow state feeds parent unread counts in
 * `chat.list`.
 */
export function useThreadFollowStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('thread.onFollowUpdated', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
        }
    });

    const { reset } = hausTrpc.thread.onFollowUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyThreadFollow(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyThreadFollow(
    coalescer: TargetedReadCoalescer,
    event: ThreadFollowUpdatedEvent
) {
    coalescer.noteMessageAnnotated({
        chatId: event.parentChatId,
        messageId: event.anchorMessageId,
        serverId: event.serverId,
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.chat.list, { serverId: event.serverId }),
    });
}
