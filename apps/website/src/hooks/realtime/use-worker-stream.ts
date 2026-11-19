import type { WorkerUpdatedEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { refreshTaskReads } from './task-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

export function useWorkerStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('worker.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.worker.listForChat, { serverId }),
            });
            invalidateActiveWork(coalescer, serverId);
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
        }
    });

    const { reset } = hausTrpc.worker.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyWorkerUpdate(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyWorkerUpdate(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    event: WorkerUpdatedEvent
) {
    const { chatId, messageId, serverId, taskId } = event;
    if (taskId) {
        refreshTaskReads(coalescer, queryClient, { serverId, taskId });
    }
    coalescer.noteMessageAnnotated({ chatId, messageId, serverId });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.worker.listForChat, { chatId, serverId }),
    });
    invalidateActiveWork(coalescer, serverId);
}

function invalidateActiveWork(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.worker.listLinks, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.worker.listAutomations, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.worker.listActive, { serverId }),
    });
}
