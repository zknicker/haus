import type { Task } from '@haus/api';
import { Chip } from '@heroui/react';

type TaskActivityView = 'failed' | 'idle' | 'needs-you' | 'waiting' | 'working';

const activityLabels: Record<TaskActivityView, string> = {
    failed: 'Failed',
    idle: 'Idle',
    'needs-you': 'Needs you',
    waiting: 'Waiting',
    working: 'Working',
};

const activityColors: Record<TaskActivityView, 'accent' | 'danger' | 'default' | 'warning'> = {
    failed: 'danger',
    idle: 'default',
    'needs-you': 'warning',
    waiting: 'default',
    working: 'accent',
};

export function taskActivityView(task: Pick<Task, 'activity' | 'needsYou'>) {
    const view: TaskActivityView = task.needsYou ? 'needs-you' : task.activity;
    return view;
}

export function taskActivityLabel(task: Pick<Task, 'activity' | 'needsYou'>) {
    return activityLabels[taskActivityView(task)];
}

export function TaskActivityChip({ task }: { task: Pick<Task, 'activity' | 'needsYou'> }) {
    const view = taskActivityView(task);
    return (
        <Chip color={activityColors[view]} size="sm" variant="soft">
            <Chip.Label>{activityLabels[view]}</Chip.Label>
        </Chip>
    );
}
