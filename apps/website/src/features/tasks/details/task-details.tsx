import type { TaskDetail } from '@haus/api';
import type * as React from 'react';
import { TaskDescription } from './task-description.tsx';
import { TaskDuePicker, TaskLabelsPicker, TaskPrioritySelect } from './task-detail-pickers.tsx';

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
            <dl className="task-facts">
                <TaskFact label="Priority">
                    <TaskPrioritySelect task={task} />
                </TaskFact>
                <TaskFact label="Due">
                    <TaskDuePicker task={task} />
                </TaskFact>
                <TaskFact label="Labels">
                    <TaskLabelsPicker task={task} />
                </TaskFact>
            </dl>
            <TaskDescription task={task} />
        </div>
    );
}

export function TaskFact({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <div className="task-fact">
            <dt className="text-muted">{label}</dt>
            <dd className="flex min-w-0 items-center">{children}</dd>
        </div>
    );
}
