import type { TaskDetail } from '@haus/api';
import { cn } from '../../../lib/utils.ts';
import { formatDueOn, isOverdue, TaskAssigneeMark, TaskLabelChips } from '../task-facts.tsx';
import { taskPriorityLabels } from '../task-presentation.ts';
import { TaskPriorityIcon } from '../task-priority-icon.tsx';
import { useTaskActor } from '../use-task-people.ts';
import { DescriptionBody } from './task-description.tsx';
import { TaskFact } from './task-details.tsx';

export function TaskHistoryDetails({ task }: { task: TaskDetail }) {
    return (
        <section aria-label="Details" className="task-details">
            <dl className="task-facts">
                <TaskFact label="Assignee">
                    <AssigneeName task={task} />
                </TaskFact>
                <TaskFact label="Priority">
                    <span className="task-fact__text flex min-w-0 items-center gap-1.5">
                        <TaskPriorityIcon className="text-muted" priority={task.priority} />
                        <span className="truncate">{taskPriorityLabels[task.priority]}</span>
                    </span>
                </TaskFact>
                <TaskFact label="Due">
                    <span
                        className={cn(
                            'task-fact__text',
                            task.dueOn === null && 'text-muted',
                            isOverdue(task) && 'text-danger'
                        )}
                    >
                        {task.dueOn ? formatDueOn(task.dueOn) : 'None'}
                    </span>
                </TaskFact>
                {task.labelIds.length > 0 ? (
                    <TaskFact label="Labels">
                        <span className="task-fact__text flex min-w-0 flex-wrap items-center gap-1">
                            <TaskLabelChips labelIds={task.labelIds} />
                        </span>
                    </TaskFact>
                ) : null}
            </dl>
            {task.description ? (
                <div className="task-description-body">
                    <DescriptionBody task={task} />
                </div>
            ) : null}
        </section>
    );
}

function AssigneeName({ task }: { task: Pick<TaskDetail, 'assignee' | 'serverId'> }) {
    const person = useTaskActor(task.serverId, task.assignee);
    return (
        <span className="task-fact__text flex min-w-0 items-center gap-1.5">
            <TaskAssigneeMark assignee={task.assignee} />
            <span className={person ? 'truncate' : 'text-muted'}>
                {person?.label ?? 'Unassigned'}
            </span>
        </span>
    );
}
