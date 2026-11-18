import type { TaskDetail } from '@haus/api';
import { InlineCard } from '../../../components/ui/inline-card.tsx';
import { formatDueOn, TaskAssigneeMark, TaskLabelChips } from '../task-facts.tsx';
import { taskPriorityLabels } from '../task-presentation.ts';
import { TaskPriorityIcon } from '../task-priority-icon.tsx';
import { useTaskActor } from '../use-task-people.ts';
import { DescriptionBody } from './task-description.tsx';
import { TaskFact } from './task-details-card.tsx';

export function TaskHistoryDetails({ task }: { task: TaskDetail }) {
    return (
        <InlineCard
            aria-label="Details"
            className="border-separator bg-nested-surface border p-3"
            role="region"
            tone="plain"
        >
            <div className="flex min-w-0 flex-col gap-3">
                <dl className="flex min-w-0 flex-col">
                    <TaskFact label="Assignee">
                        <AssigneeName task={task} />
                    </TaskFact>
                    <TaskFact label="Priority">
                        <span className="flex min-w-0 items-center gap-1.5">
                            <TaskPriorityIcon className="text-muted" priority={task.priority} />
                            <span className="truncate">{taskPriorityLabels[task.priority]}</span>
                        </span>
                    </TaskFact>
                    <TaskFact label="Due">
                        <span className={task.dueOn ? undefined : 'text-muted'}>
                            {task.dueOn ? formatDueOn(task.dueOn) : 'None'}
                        </span>
                    </TaskFact>
                    {task.labelIds.length > 0 ? (
                        <TaskFact label="Labels">
                            <span className="flex min-w-0 flex-wrap items-center gap-1">
                                <TaskLabelChips labelIds={task.labelIds} />
                            </span>
                        </TaskFact>
                    ) : null}
                </dl>
                {task.description ? <DescriptionBody task={task} /> : null}
            </div>
        </InlineCard>
    );
}

function AssigneeName({ task }: { task: Pick<TaskDetail, 'assignee' | 'serverId'> }) {
    const person = useTaskActor(task.serverId, task.assignee);
    return (
        <span className="flex min-w-0 items-center gap-1.5">
            <TaskAssigneeMark assignee={task.assignee} />
            <span className={person ? 'truncate' : 'text-muted'}>
                {person?.label ?? 'Unassigned'}
            </span>
        </span>
    );
}
