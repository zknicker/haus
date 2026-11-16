import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { findBoardColumn } from '../boards/board-cache.ts';
import { moveTaskInCache, taskReads, writeTaskResult } from './task-cache.ts';

/**
 * Moves a Task to a column of its board at once, in every cached read, so a
 * Board drag lands under the pointer. A refusal (a stale `expectedVersion`, a
 * column gone) puts the Task back and re-reads it; the ack writes the Server's
 * record and `task.onUpdated` keeps every other read current. Moves run one at
 * a time, so a second drag of the same card reaches the Server after the first
 * it was versioned against. Without the board cached there is no category to
 * show, so the move simply waits for its ack.
 */
export function useMoveTask() {
    const queryClient = useQueryClient();
    const utils = hausTrpc.useUtils();
    return hausTrpc.task.move.useMutation<{ undo: () => void }>({
        onError: (_error, { serverId, taskId }, context) => {
            context?.undo();
            for (const { queryKey } of taskReads(queryClient, serverId, taskId)) {
                void queryClient.invalidateQueries({ exact: true, queryKey });
            }
        },
        onMutate: async ({ columnId, serverId, taskId }) => {
            const column = findBoardColumn(utils.board.list.getData({ serverId }), columnId);
            if (!column) {
                return { undo: () => undefined };
            }
            const reads = new Set<unknown>(taskReads(queryClient, serverId, taskId));
            // A read already in flight predates the move and would land over it.
            await queryClient.cancelQueries({ predicate: (query) => reads.has(query) });
            return { undo: moveTaskInCache(queryClient, { column, serverId, taskId }) };
        },
        onSuccess: ({ task }) => writeTaskResult(queryClient, task),
        scope: { id: 'task.move' },
    });
}
