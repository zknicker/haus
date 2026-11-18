import type { ChatLifecycleEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { applyChatDeletion, invalidateChatLifecycleReads } from './chat-deletion.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `chat.onLifecycle`: creating, renaming, archiving, or deleting a Chat moves
 * the active and archived lists, that Chat's own read, and Agent Chat rows.
 * `deleted` runs the shared Chat-deletion path (`applyChatDeletion`), the same
 * one a per-Chat stream's `chat_missing` refusal runs.
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
        applyChatDeletion({ chatId, coalescer, queryClient, serverId });
        return;
    }
    invalidateChatLifecycleReads(coalescer, serverId, chatId);
}
