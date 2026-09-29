import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import {
    formatTaskNumber,
    type MessageTask,
    messageTaskAssigneeLabel,
    taskStatusLabels,
} from './task-presentation.ts';
import { TaskStatusDisc } from './task-status-disc.tsx';

export interface MessageTaskAssigneeProfile {
    avatarUrl: null | string;
    name: string;
}

/**
 * One Task as it reads in the header of its Message's recessed Thread surface:
 * the number, a status disc, and the assignee whose work it is. Task-chip
 * grammar — annotation scale, neutral throughout, with only the disc carrying
 * lifecycle color, the same shape the Cloud Agent work
 * header takes in that slot.
 *
 * The surface itself is the way into the work, so the chip is inert: it is a
 * label on a button, not a second target inside one.
 */
export function MessageTaskChip({
    assigneeProfile,
    task,
}: {
    assigneeProfile?: MessageTaskAssigneeProfile | null;
    task: MessageTask;
}) {
    const ownerName = assigneeProfile?.name ?? messageTaskAssigneeLabel(task);

    return (
        <span
            // Annotation scale, matching the author line — without an explicit
            // size it inherits the message container and outgrows the body text.
            className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-semibold text-muted text-sm"
            data-testid="message-task-chip"
        >
            <span className="shrink-0 tabular-nums">Task {formatTaskNumber(task)}</span>
            <TaskStatusDisc className="size-3.5" status={task.status} />
            <span className="sr-only">{taskStatusLabels[task.status]}</span>
            {ownerName ? (
                <span className="flex min-w-0 items-center gap-1.5">
                    {assigneeProfile ? (
                        <EntityAvatar
                            name={assigneeProfile.name}
                            size={14}
                            src={assigneeProfile.avatarUrl}
                        />
                    ) : null}
                    <span className="truncate">{ownerName}</span>
                </span>
            ) : null}
        </span>
    );
}
