import type { Task } from '@haus/api';
import * as React from 'react';
import { useTaskList } from './use-task-list.ts';

export function useTasksById(serverId: string, { enabled = true }: { enabled?: boolean } = {}) {
    const active = useTaskList(serverId, {}, { enabled }).data;
    const archived = useTaskList(serverId, { archived: true }, { enabled }).data;
    return React.useMemo(
        () =>
            new Map<string, Task>(
                [...(active ?? []), ...(archived ?? [])].map((task) => [task.id, task])
            ),
        [active, archived]
    );
}
