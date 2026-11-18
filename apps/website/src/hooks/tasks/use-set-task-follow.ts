import type { TaskDetail } from '@haus/api';
import { useQueryClient } from '@tanstack/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { taskDetailKeys } from './task-cache.ts';

/**
 * Follows or unfollows a Task by hand (ADR 0052 decision 9). The receipt
 * writes `followed` into the Task's cached detail so the control settles at
 * once; unread and the Inbox move with `task.onFollowUpdated`.
 */
export function useSetTaskFollow() {
    const queryClient = useQueryClient();
    return hausTrpc.task.setFollow.useMutation({
        onSuccess: ({ followed, serverId, taskId }) => {
            for (const queryKey of taskDetailKeys(queryClient, serverId, (t) => t.id === taskId)) {
                queryClient.setQueryData<TaskDetail>(queryKey, (detail) =>
                    detail ? { ...detail, followed } : detail
                );
            }
        },
    });
}
