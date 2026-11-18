import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { writeTaskResult } from './task-cache.ts';

/**
 * Moves a Task to `todo`, `open`, `done`, or `canceled` (ADR 0053 decision 13).
 * The ack writes the record into every cached read; which lists hold it (the
 * sidebar drops a closed Task) stays with `task.onUpdated`.
 */
export function useSetTaskState() {
    const queryClient = useQueryClient();
    return hausTrpc.task.setState.useMutation({
        onSuccess: ({ task }) => writeTaskResult(queryClient, task),
    });
}
