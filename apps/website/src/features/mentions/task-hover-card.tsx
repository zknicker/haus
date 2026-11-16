import type { Board, Task } from '@haus/api';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useBoards } from '../../hooks/boards/use-boards.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { ColumnCategoryDisc } from '../tasks/column-category-disc.tsx';
import { formatDueOn } from '../tasks/task-facts.tsx';
import { taskPriorityLabels } from '../tasks/task-presentation.ts';
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
    const boards = useBoards(serverId);
    const task = read.data ?? null;
    const assignee = useTaskActor(serverId, task?.assignee ?? null);

    return (
        <TaskHoverCardView
            assignee={assignee}
            board={boards.data?.find((candidate) => candidate.id === task?.boardId) ?? null}
            displayLabel={displayLabel}
            isUnavailable={Boolean(read.error)}
            task={task}
        />
    );
}

export function TaskHoverCardView({
    assignee,
    board,
    displayLabel,
    isUnavailable,
    task,
}: {
    assignee: null | Pick<TaskPerson, 'avatarUrl' | 'label'>;
    board: Pick<Board, 'columns' | 'name'> | null;
    displayLabel: string;
    isUnavailable: boolean;
    task: null | Pick<Task, 'category' | 'columnId' | 'dueOn' | 'key' | 'priority' | 'title'>;
}) {
    const column = board?.columns.find((candidate) => candidate.id === task?.columnId);
    const facts = [assignee?.label, ...(task ? taskFacts(task) : [])].filter(Boolean);

    return (
        <ReferencePreviewHeader
            mark={
                task ? (
                    <ColumnCategoryDisc category={task.category} />
                ) : (
                    <ReferencePreviewMark appearance={{ icon: 'task' }} />
                )
            }
            meta={[column?.name, board?.name].filter(Boolean).join(' · ') || null}
            title={task?.key ?? displayLabel}
        >
            {isUnavailable ? <ReferencePreviewText>Task unavailable</ReferencePreviewText> : null}
            {task ? (
                <ReferencePreviewText className="font-semibold" tone="foreground">
                    {task.title}
                </ReferencePreviewText>
            ) : null}
            {facts.length > 0 ? (
                <div className="flex min-w-0 items-center gap-1.5 text-muted text-xs">
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
