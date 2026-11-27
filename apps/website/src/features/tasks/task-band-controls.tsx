import type { TaskDetail } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { Notification01Icon, NotificationOff01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useSetTaskFollow } from '../../hooks/tasks/use-set-task-follow.ts';
import { useTask } from '../../hooks/tasks/use-task.ts';
import { agentPanelKey } from '../agent-panel/agent-panel-model.ts';
import { ClosedAgentPanelToggle } from '../agent-panel/agent-panel-toggle.tsx';
import { useServerContext } from '../servers/server-context.ts';
import { TaskActivityChip } from './task-activity.tsx';
import { TaskMenu } from './task-menu.tsx';
import { showTaskUpdateError } from './task-update-error.ts';

export function TaskBandControls({ shortId }: { shortId: string }) {
    const { server } = useServerContext();
    const task = useTask(server.id, { shortId }).data;
    if (!task) {
        return null;
    }
    return (
        <>
            {task.archivedAt ? <span className="text-muted text-sm">Archived</span> : null}
            <TaskActivityChip task={task} />
            {task.chatId ? <FollowButton task={task} /> : null}
            <TaskMenu task={task} />
            {task.chatId ? (
                <ClosedAgentPanelToggle panelKey={agentPanelKey({ kind: 'task', shortId })} />
            ) : null}
        </>
    );
}

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
