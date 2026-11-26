import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { writeTaskResult } from './task-cache.ts';

export function useStartTask() {
    const queryClient = useQueryClient();
    return hausTrpc.task.start.useMutation({
        onSuccess: ({ task }) => writeTaskResult(queryClient, task),
    });
}
