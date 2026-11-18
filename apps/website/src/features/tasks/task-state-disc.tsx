import type { TaskState } from '@haus/api';
import { taskStateDiscs } from './task-state.ts';
import { TaskStatusDisc } from './task-status-disc.tsx';

/** A Task's state as its status disc. */
export function TaskStateDisc({ className, state }: { className?: string; state: TaskState }) {
    return <TaskStatusDisc className={className} status={taskStateDiscs[state]} />;
}
