import type { TaskDetail } from '@haus/api';
import type * as React from 'react';

import { InlineCard } from '../../../components/ui/inline-card.tsx';
import { TaskDescription } from './task-description.tsx';
import { TaskDuePicker, TaskLabelsPicker, TaskPrioritySelect } from './task-detail-pickers.tsx';

export function TaskDetailsCard({ task }: { task: TaskDetail }) {
    return (
        <InlineCard
            aria-label="Details"
            className="border-separator bg-nested-surface border p-3"
            role="region"
            tone="plain"
        >
            <TaskDetails task={task} />
        </InlineCard>
    );
}

export function TaskDetails({ task }: { task: TaskDetail }) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <dl className="flex min-w-0 flex-col">
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
        <div className="grid min-h-8 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="flex min-w-0 items-center">{children}</dd>
        </div>
    );
}
