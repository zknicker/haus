import type { Task } from '@haus/api';
import { showTaskUpdateError } from '../../features/tasks/task-update-error.ts';
import { useArchiveTask } from './use-archive-task.ts';
import { useUnarchiveTask } from './use-unarchive-task.ts';

export function useSetTaskArchived() {
    const archive = useArchiveTask();
    const unarchive = useUnarchiveTask();
    return {
        isPending: archive.isPending || unarchive.isPending,
        set: (task: Pick<Task, 'id' | 'serverId' | 'version'>, archived: boolean) => {
            const mutation = archived ? archive : unarchive;
            mutation.mutate(
                { expectedVersion: task.version, serverId: task.serverId, taskId: task.id },
                { onError: showTaskUpdateError }
            );
        },
    };
}
