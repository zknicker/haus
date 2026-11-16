import type { BoardColumn, TaskInboxItem } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import { dropTaskInboxItem } from '../../../hooks/task-inbox/task-inbox-cache.ts';
import { useRestoreTaskInboxItem } from '../../../hooks/task-inbox/use-restore-task-inbox-item.ts';
import { useMoveTask } from '../../../hooks/tasks/use-move-task.ts';
import { hausTrpc } from '../../../lib/haus-server.tsx';
import type { ResolvedTask } from './task-inbox-model.ts';

/**
 * Resolving a Task from its Inbox card (ADR 0051): Start, Done, Won't do, or
 * any column from the status picker. The card leaves at once and a slim row
 * holds its place with an Undo; the Server clears the item because the
 * assignee moved it. Only the newest resolve keeps its row: the next card the
 * reader works takes the Undo away, as a mail client's does.
 *
 * Undo moves the Task back and then restores the item, in that order, because
 * the move would clear a restored item again. Its row stays until the list has
 * re-read, so the card comes back in the same frame the row leaves.
 */
export function useTaskInboxResolve(serverId: string) {
    const utils = hausTrpc.useUtils();
    const move = useMoveTask();
    const restore = useRestoreTaskInboxItem();
    const [resolved, setResolved] = React.useState<null | ResolvedTask>(null);
    const [undoing, setUndoing] = React.useState(false);

    const resolve = (item: TaskInboxItem, column: BoardColumn, index: number) => {
        const { id: taskId, key, version: expectedVersion } = item.task;
        void dropTaskInboxItem(utils, { serverId, taskId });
        const moved = move.mutateAsync({ columnId: column.id, expectedVersion, serverId, taskId });
        const next = { column, index, item, moved };
        setResolved(next);
        moved.catch(() => {
            setResolved((current) => (current === next ? null : current));
            void utils.taskInbox.list.invalidate({ serverId });
            toast.danger(`Could not move ${key}`);
        });
    };

    const undo = async () => {
        if (!resolved) {
            return;
        }
        const { item, moved } = resolved;
        const { columnId, id: taskId, key } = item.task;
        setUndoing(true);
        try {
            const { task } = await moved;
            await move.mutateAsync({
                columnId,
                expectedVersion: task.version,
                serverId,
                taskId,
            });
            await restore.mutateAsync({ serverId, taskId });
            setResolved(null);
        } catch {
            toast.danger(`Could not undo ${key}`);
        } finally {
            setUndoing(false);
        }
    };

    return { dismiss: () => setResolved(null), resolve, resolved, undo, undoing };
}
