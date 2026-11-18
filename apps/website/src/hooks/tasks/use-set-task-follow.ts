import type { TaskDetail } from '@haus/api';
import { useQueryClient } from '@tanstack/react-query';

import { hausTrpc } from '../../lib/haus-server.tsx';
import { taskDetailKeys } from './task-cache.ts';

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
