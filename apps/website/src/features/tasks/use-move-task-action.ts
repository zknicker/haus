import type { Task } from '@haus/api';
import { toast } from '@heroui/react';
import { useMoveTask } from '../../hooks/tasks/use-move-task.ts';
import { useServerContext } from '../servers/server-context.ts';

/**
 * Moves a Task from a surface, which has no row of its own to report a refusal
 * on: the card snaps back through `useMoveTask` and the reason lands in a toast.
 */
export function useMoveTaskAction() {
    const { server } = useServerContext();
    const move = useMoveTask();
    return (task: Pick<Task, 'columnId' | 'id' | 'version'>, columnId: string) => {
        if (task.columnId === columnId) {
            return;
        }
        move.mutate(
            { columnId, expectedVersion: task.version, serverId: server.id, taskId: task.id },
            {
                onError: (error) =>
                    toast.danger('Task move failed', { description: error.message }),
            }
        );
    };
}
