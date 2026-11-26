import type { TaskDetail } from '@haus/api';
import { TaskDescription } from './task-description.tsx';

export function TaskDetailsSection({ task }: { task: TaskDetail }) {
    return (
        <section aria-label="Details">
            <TaskDetails task={task} />
        </section>
    );
}

export function TaskDetails({ task }: { task: TaskDetail }) {
    return (
        <div className="task-details">
            <TaskDescription task={task} />
        </div>
    );
}
