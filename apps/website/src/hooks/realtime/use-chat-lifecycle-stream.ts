import type { ChatLifecycleEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { runChatLoss } from '../servers/server-loss.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `chat.onLifecycle`: creating, renaming, archiving, or deleting a Chat moves
 * the active and archived lists, that Chat's own read, and Agent Chat rows.
 * `deleted` also runs the Chat-loss purge (`runChatLoss`): its lists,
 * entities, pending rows, kept view, and every other read of the Chat.
 */
export function useChatLifecycleStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('chat.onLifecycle', serverId, () => {
        if (serverId) {
            invalidateChatLifecycleReads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.chat.onLifecycle.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyChatLifecycle(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyChatLifecycle(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    event: ChatLifecycleEvent
) {
    const { chatId, serverId } = event;
    if (event.action === 'deleted') {
        void runChatLoss({ chatId, coalescer, queryClient, serverId });
    }
    invalidateChatLifecycleReads(coalescer, serverId, chatId);
}

/** Without a Chat id (recovery), every cached `chat.get` of the Server refreshes. */
function invalidateChatLifecycleReads(
    coalescer: TargetedReadCoalescer,
    serverId: string,
    chatId?: string
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.listArchived, { serverId }) });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.chat.get, chatId ? { chatId, serverId } : { serverId }),
    });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.agent.chats, { serverId }) });
}
