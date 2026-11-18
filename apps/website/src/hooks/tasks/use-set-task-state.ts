import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { writeTaskResult } from './task-cache.ts';

export function useSetTaskState() {
    const queryClient = useQueryClient();
    return hausTrpc.task.setState.useMutation({
        onSuccess: ({ task }) => writeTaskResult(queryClient, task),
    });
}
