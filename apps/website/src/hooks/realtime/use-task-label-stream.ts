import type { TaskLabelUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `taskLabel.onUpdated`: the label catalog and the task list (task rows embed
 * their labels), plus every cached transcript and entity carrying the label.
 */
export function useTaskLabelStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('taskLabel.onUpdated', serverId, () => {
        if (serverId) {
            invalidateLabelReads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.taskLabel.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyTaskLabelUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyTaskLabelUpdate(
    coalescer: TargetedReadCoalescer,
    event: TaskLabelUpdatedEvent
) {
    void coalescer.noteTaskLabelUpdated(event);
    invalidateLabelReads(coalescer, event.serverId);
}

function invalidateLabelReads(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.taskLabel.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
}
