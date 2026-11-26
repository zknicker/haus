import { isTaskShortId, type Task } from '@haus/api';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';
import { taskStateLabels, taskStateOf } from '../tasks/task-state.ts';
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
    const read = useTask(serverId, isTaskShortId(taskId) ? { shortId: taskId } : { taskId });
    const task = read.data ?? null;
    const starter = useTaskActor(serverId, task?.createdBy ?? null);

    return (
        <TaskHoverCardView
            displayLabel={displayLabel}
            isUnavailable={Boolean(read.error)}
            starter={starter}
            task={task}
        />
    );
}

export function TaskHoverCardView({
    displayLabel,
    isUnavailable,
    starter,
    task,
}: {
    displayLabel: string;
    isUnavailable: boolean;
    starter: null | Pick<TaskPerson, 'avatarUrl' | 'label'>;
    task: null | Pick<Task, 'archivedAt' | 'shortId' | 'title'>;
}) {
    const state = task ? taskStateOf(task) : null;
    return (
        <ReferencePreviewHeader
            mark={
                state ? (
                    <TaskStateDisc state={state} />
                ) : (
                    <ReferencePreviewMark appearance={{ icon: 'task' }} />
                )
            }
            meta={state ? taskStateLabels[state] : null}
            title={task?.title ?? displayLabel}
        >
            {isUnavailable ? <ReferencePreviewText>Task unavailable</ReferencePreviewText> : null}
            {starter ? (
                <div className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
                    <EntityAvatar name={starter.label} size={16} src={starter.avatarUrl} />
                    <span className="min-w-0 truncate">Started by {starter.label}</span>
                </div>
            ) : null}
        </ReferencePreviewHeader>
    );
}
