import type { TaskUpdatedEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { refreshTaskReads } from './task-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useTaskUpdatedStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('task.onUpdated', serverId, () => {
        if (serverId) {
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
    { serverId, taskId }: TaskUpdatedEvent
) {
    refreshTaskReads(coalescer, queryClient, { serverId, taskId });
    invalidateServerReads(coalescer, serverId);
}

function invalidateServerReads(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.listActive, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.crewLifecycle, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.chat.unreadPreviews, { serverId }) });
}
