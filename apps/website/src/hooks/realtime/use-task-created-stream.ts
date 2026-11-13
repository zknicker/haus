import type { TaskCreatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `task.onCreated`: that board's Task lists and the board list's open count.
 * A person's assignment arrives on `taskInbox.onChanged`. A start reconciles
 * every board's lists.
 */
export function useTaskCreatedStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('task.onCreated', serverId, () => {
        if (serverId) {
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.board.list, { serverId }) });
        }
    });

    const { reset } = hausTrpc.task.onCreated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyTaskCreated(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyTaskCreated(
    coalescer: TargetedReadCoalescer,
    { boardId, serverId }: TaskCreatedEvent
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { boardId, serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.board.list, { serverId }) });
}
