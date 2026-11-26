import { type TaskState, taskStateDiscs } from './task-state.ts';
import { TaskStatusDisc } from './task-status-disc.tsx';

export function TaskStateDisc({ className, state }: { className?: string; state: TaskState }) {
    return <TaskStatusDisc className={className} status={taskStateDiscs[state]} />;
}
