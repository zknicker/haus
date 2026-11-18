import type { TaskDetail } from '@haus/api';
import { Button, Popover, Tooltip } from '@heroui/react';
import {
    Copy01Icon,
    InformationCircleIcon,
    Notification01Icon,
    NotificationOff01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useSetTaskFollow } from '../../hooks/tasks/use-set-task-follow.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { useServerContext } from '../servers/server-context.ts';
import { copyTaskReference } from './copy-task-reference.ts';
import { TaskDetails } from './details/task-details-card.tsx';
import { TaskAssigneeSelect, TaskStateSelect } from './task-properties.tsx';
import { taskStateLabels } from './task-state.ts';
import { TaskStateDisc } from './task-state-disc.tsx';
import { showTaskUpdateError } from './task-update-error.ts';

/**
 * The Task page band's controls: its state, its assignee, its Details when
 * the pane is too narrow for the right-hand panel, following, and the
 * reference to paste. A chatless Task shows its state as text and keeps only
 * its reference. Each reads the one cached `task.get`; nothing until it has
 * answered.
 */
export function TaskBandControls({
    detailsInBand,
    taskKey,
}: {
    /** The page shows no right-hand panel, so the band carries the Details. */
    detailsInBand: boolean;
    taskKey: string;
}) {
    const { server } = useServerContext();
    const task = useTask(server.id, { key: taskKey }).data;
    if (!task) {
        return null;
    }
    // A chatless Task is read-only history (the Server refuses its edits): its
    // page shows the Details itself, its state is text, and with no
    // conversation there is nothing to follow.
    const isHistory = task.chatId === null;
    return (
        <>
            {isHistory ? <TaskStateText state={task.state} /> : <TaskStateSelect task={task} />}
            {isHistory ? null : <TaskAssigneeSelect task={task} />}
            {detailsInBand && !isHistory ? <DetailsButton task={task} /> : null}
            {isHistory ? null : <FollowButton task={task} />}
            <Tooltip>
                <Button
                    aria-label="Copy reference"
                    isIconOnly
                    onPress={() => copyTaskReference(task.key)}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Copy01Icon} size={16} />
                </Button>
                <Tooltip.Content>Copy reference</Tooltip.Content>
            </Tooltip>
        </>
    );
}

/** A history Task's state: the disc and its name, nothing to press. */
function TaskStateText({ state }: { state: TaskDetail['state'] }) {
    return (
        <span className="flex items-center gap-1.5 text-sm">
            <TaskStateDisc state={state} />
            {taskStateLabels[state]}
        </span>
    );
}

/** The Details card in a popover, for a pane too narrow to show it beside the conversation. */
function DetailsButton({ task }: { task: TaskDetail }) {
    return (
        <Popover>
            <Button size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={InformationCircleIcon} size={16} />
                Details
            </Button>
            <Popover.Content className="w-80 max-w-[calc(100vw-2rem)]" placement="bottom end">
                <Popover.Dialog aria-label="Details">
                    <TaskDetails task={task} />
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

/** A follower sees the Task unread and in their Inbox (ADR 0052 decision 9). */
function FollowButton({ task }: { task: Pick<TaskDetail, 'followed' | 'id' | 'serverId'> }) {
    const follow = useSetTaskFollow();
    const label = task.followed ? 'Stop following' : 'Follow';
    return (
        <Tooltip>
            <Button
                aria-label={task.followed ? 'Stop following task' : 'Follow task'}
                aria-pressed={task.followed}
                isIconOnly
                isPending={follow.isPending}
                onPress={() =>
                    follow.mutate(
                        { followed: !task.followed, serverId: task.serverId, taskId: task.id },
                        { onError: showTaskUpdateError }
                    )
                }
                size="sm"
                variant="ghost"
            >
                <Icon
                    aria-hidden="true"
                    icon={task.followed ? Notification01Icon : NotificationOff01Icon}
                    size={16}
                />
            </Button>
            <Tooltip.Content>{label}</Tooltip.Content>
        </Tooltip>
    );
}
