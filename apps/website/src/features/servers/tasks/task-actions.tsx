import { useServerContext } from '../server-context.ts';
import { TaskAssignee } from './task-assignee.tsx';
import { TaskMetadata } from './task-metadata.tsx';
import type { TaskItem } from './task-model.ts';

/**
 * A Board card's controls. People hand work to an Agent here; they never
 * claim a task themselves (ADR 0037).
 */
export function TaskActions({ task }: { task: TaskItem }) {
    const { server } = useServerContext();
    return (
        <div className="relative z-20 flex flex-wrap items-center gap-2">
            <TaskMetadata task={task} />
            <TaskAssignee serverId={server.id} task={task} />
        </div>
    );
}
