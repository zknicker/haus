import type { TaskChangedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/** `task.onChanged`: the task card on its message's entity, and the Server task list. */
export function useTaskChangeStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('task.onChanged', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
        }
    });

    const { reset } = hausTrpc.task.onChanged.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyTaskChange(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyTaskChange(coalescer: TargetedReadCoalescer, event: TaskChangedEvent) {
    coalescer.noteMessageAnnotated(event);
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.task.list, { serverId: event.serverId }),
    });
}
