import type { Task } from '@haus/api';
import { TaskAssigneeMark, TaskDueDate, TaskLabelChips, TaskWorkingMark } from './task-facts.tsx';
import { taskPriorityLabels } from './task-presentation.ts';
import { TaskPriorityIcon } from './task-priority-icon.tsx';

/** A card's face: the key and who holds it, the title, then its priority, labels, and due date. */
export function TaskCard({ task }: { task: Task }) {
    const hasFacts = task.priority !== 'none' || task.labelIds.length > 0 || task.dueOn !== null;

    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-muted text-xs tabular-nums">{task.key}</span>
                <TaskWorkingMark task={task} />
                <span className="ms-auto">
                    <TaskAssigneeMark assignee={task.assignee} />
                </span>
            </div>
            <span className="text-foreground">{task.title}</span>
            {hasFacts ? (
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {task.priority === 'none' ? null : (
                        <span title={taskPriorityLabels[task.priority]}>
                            <TaskPriorityIcon className="text-muted" priority={task.priority} />
                        </span>
                    )}
                    <TaskLabelChips labelIds={task.labelIds} />
                    <span className="ms-auto">
                        <TaskDueDate task={task} />
                    </span>
                </div>
            ) : null}
        </div>
    );
}
