import type { Task } from '@haus/api';
import { ContextMenu } from '@heroui-pro/react';
import { Label } from '@heroui/react';
import { ArrowUpRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { RowTabItems, runRowTabItem, useRowTabOpeners } from '../shell/open-in-new-tab-item.tsx';
import { TaskMenuSections } from '../tasks/task-menu-sections.tsx';

export function TaskNavigationContextMenu({
    children,
    href,
    serverId,
    taskId,
}: {
    children: React.ReactNode;
    href: string;
    serverId: string;
    taskId: string;
}) {
    return (
        <ContextMenu>
            <ContextMenu.Trigger className="flex min-w-0 flex-1 items-center gap-3">
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <TaskRowContextMenu href={href} serverId={serverId} taskId={taskId} />
            </ContextMenu.Popover>
        </ContextMenu>
    );
}

function TaskRowContextMenu({
    href,
    serverId,
    taskId,
}: {
    href: string;
    serverId: string;
    taskId: string;
}) {
    const navigate = useSidebarNavigate();
    const tabOpeners = useRowTabOpeners();
    const task = useOpenTask(serverId, taskId);
    if (!task) {
        return null;
    }
    return (
        <ContextMenu.Menu
            aria-label={`${task.title} actions`}
            onAction={(key) => {
                if (key === 'open-task') {
                    navigate(href);
                    return;
                }
                runRowTabItem(tabOpeners, key, href);
            }}
        >
            <ContextMenu.Item id="open-task" textValue={`Open ${task.title}`}>
                <Icon aria-hidden="true" icon={ArrowUpRight01Icon} size={16} />
                <Label>Open task</Label>
            </ContextMenu.Item>
            {tabOpeners ? <RowTabItems /> : null}
            <ContextMenu.Separator />
            <TaskMenuSections task={task} />
        </ContextMenu.Menu>
    );
}

function useOpenTask(serverId: string, taskId: string) {
    const select = React.useCallback(
        (tasks: Task[]) => tasks.find((task) => task.id === taskId),
        [taskId]
    );
    return hausTrpc.task.listActive.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select })
        .data;
}
