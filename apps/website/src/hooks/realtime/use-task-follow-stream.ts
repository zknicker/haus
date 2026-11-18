import type { TaskFollowUpdatedEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { refreshTaskReads } from './task-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `task.onFollowUpdated` (the viewer's own follows, ADR 0053 decision 9):
 * following decides whether a Task is unread for the viewer, so the Task's
 * detail and origin preview (`followed`, `unreadCount`) and the Inbox's
 * unread rows, which are also the sidebar's unread marks, refresh. A start
 * reconciles every Task detail and the previews.
 */
export function useTaskFollowStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('task.onFollowUpdated', serverId, () => {
        if (serverId) {
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
            invalidateUnreadPreviews(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.task.onFollowUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyTaskFollow(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyTaskFollow(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    { serverId, taskId }: TaskFollowUpdatedEvent
) {
    refreshTaskReads(coalescer, queryClient, { serverId, taskId });
    invalidateUnreadPreviews(coalescer, serverId);
}

function invalidateUnreadPreviews(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
}
