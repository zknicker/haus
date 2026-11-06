import type { BoardUpdatedEvent } from '@haus/api';
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
 * `board.onUpdated`: the board list, that board's Task reads (a re-key changes
 * every Task's key), and the Task Inbox, whose items carry the board's name.
 * A start reconciles every board's reads.
 */
export function useBoardUpdateStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('board.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
            invalidateServerReads(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.board.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyBoardUpdate(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyBoardUpdate(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    { boardId, serverId }: BoardUpdatedEvent
) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.list, { boardId, serverId }) });
    for (const queryKey of taskDetailKeys(
        queryClient,
        serverId,
        (detail) => detail.boardId === boardId
    )) {
        coalescer.invalidate({ exact: true, queryKey });
    }
    invalidateServerReads(coalescer, serverId);
}

function invalidateServerReads(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.board.list, { serverId }) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.taskInbox.list, { serverId }) });
}
