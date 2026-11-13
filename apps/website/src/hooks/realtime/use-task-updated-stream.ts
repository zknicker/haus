import type { TaskUpdatedEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { taskDetailKeys } from '../tasks/task-cache.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `task.onUpdated`: that Task's detail (its Mentioned in and Reminders too:
 * a new reference publishes this at the same version), its board's lists, the
 * board list's open count, and the Task Inbox, whose items embed the Task. A
 * start reconciles every Task read.
 */
export function useTaskUpdatedStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('task.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
            invalidateServerReads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.task.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyTaskUpdate(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyTaskUpdate(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    { boardId, serverId, taskId }: TaskUpdatedEvent
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { boardId, serverId }) });
    for (const queryKey of taskDetailKeys(queryClient, serverId, (task) => task.id === taskId)) {
        coalescer.invalidate({ exact: true, queryKey });
    }
    invalidateServerReads(coalescer, serverId);
}

function invalidateServerReads(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.board.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.taskInbox.list, { serverId }) });
}
