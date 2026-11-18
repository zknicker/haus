import type { Task } from '@haus/api';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { formatDueOn } from '../tasks/task-facts.tsx';
import { taskPriorityLabels } from '../tasks/task-presentation.ts';
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';
import { taskStateLabels } from '../tasks/task-state.ts';
import { type TaskPerson, useTaskActor } from '../tasks/use-task-people.ts';
import {
    ReferencePreviewHeader,
    ReferencePreviewMark,
    ReferencePreviewText,
} from './reference-preview-header.tsx';

/**
 * What a Task chip previews. The card mounts this only while it is open, so
 * these reads run on hover and never per chip on render.
 */
export function TaskHoverCardContent({
    displayLabel,
    serverId,
    taskId,
}: {
    displayLabel: string;
    serverId: string;
    taskId: string;
}) {
    const read = useTask(serverId, { taskId });
    const task = read.data ?? null;
    const assignee = useTaskActor(serverId, task?.assignee ?? null);

    return (
        <TaskHoverCardView
            assignee={assignee}
            displayLabel={displayLabel}
            isUnavailable={Boolean(read.error)}
            task={task}
        />
    );
}

export function TaskHoverCardView({
    assignee,
    displayLabel,
    isUnavailable,
    task,
}: {
    assignee: null | Pick<TaskPerson, 'avatarUrl' | 'label'>;
    displayLabel: string;
    isUnavailable: boolean;
    task: null | Pick<Task, 'dueOn' | 'key' | 'priority' | 'state' | 'title'>;
}) {
    const facts = [assignee?.label, ...(task ? taskFacts(task) : [])].filter(Boolean);

    return (
        <ReferencePreviewHeader
            mark={
                task ? (
                    <TaskStateDisc state={task.state} />
                ) : (
                    <ReferencePreviewMark appearance={{ icon: 'task' }} />
                )
            }
            meta={task ? taskStateLabels[task.state] : null}
            title={task?.key ?? displayLabel}
        >
            {isUnavailable ? <ReferencePreviewText>Task unavailable</ReferencePreviewText> : null}
            {task ? (
                <ReferencePreviewText className="font-semibold" tone="foreground">
                    {task.title}
                </ReferencePreviewText>
            ) : null}
            {facts.length > 0 ? (
                <div className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
                    {assignee ? (
                        <EntityAvatar name={assignee.label} size={16} src={assignee.avatarUrl} />
                    ) : null}
                    <span className="min-w-0 truncate">{facts.join(' · ')}</span>
                </div>
            ) : null}
        </ReferencePreviewHeader>
    );
}

function taskFacts({ dueOn, priority }: Pick<Task, 'dueOn' | 'priority'>): string[] {
    return [
        ...(priority === 'none' ? [] : [taskPriorityLabels[priority]]),
        ...(dueOn ? [`Due ${formatDueOn(dueOn)}`] : []),
    ];
}
