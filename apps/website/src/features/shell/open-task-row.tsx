import { Sidebar } from '@heroui-pro/react';

import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { useUnreadPreview } from '../../hooks/inbox/use-unread-previews.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { useOpenTaskEntry } from '../../hooks/tasks/use-open-tasks.ts';
import { cn } from '../../lib/utils.ts';
import { taskRoute } from '../servers/server-routes.ts';
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';
import { taskStateLabels } from '../tasks/task-state.ts';

export function OpenTaskRow({
    currentPath,
    serverId,
    slug,
    taskId,
}: {
    currentPath: string;
    serverId: string;
    slug: string;
    taskId: string;
}) {
    const task = useOpenTaskEntry(serverId, taskId);
    const href = task ? taskRoute(slug, task.key) : '';
    const pressRef = usePressNavigationWith(useSidebarNavigate(), href, noPreload);
    if (!task) {
        return null;
    }
    return (
        <Sidebar.MenuItem
            href={href}
            id={taskId}
            isCurrent={href === currentPath}
            ref={pressRef}
            textValue={`${task.key} ${task.title}`}
        >
            <Sidebar.MenuIcon>
                <span aria-label={taskStateLabels[task.state]} role="img">
                    <TaskStateDisc state={task.state} />
                </span>
            </Sidebar.MenuIcon>
            <Sidebar.MenuItemContent>
                {task.chatId ? (
                    <OpenTaskLabel
                        chatId={task.chatId}
                        serverId={serverId}
                        taskKey={task.key}
                        title={task.title}
                    />
                ) : (
                    <Sidebar.MenuLabel>
                        <TaskKey taskKey={task.key} />
                        {task.title}
                    </Sidebar.MenuLabel>
                )}
            </Sidebar.MenuItemContent>
        </Sidebar.MenuItem>
    );
}

function OpenTaskLabel({
    chatId,
    serverId,
    taskKey,
    title,
}: {
    chatId: string;
    serverId: string;
    taskKey: string;
    title: string;
}) {
    const preview = useUnreadPreview(serverId, chatId);
    const unread = preview ? preview.messages.length + preview.earlierUnreadCount : 0;
    return (
        <>
            <Sidebar.MenuLabel className={cn(unread > 0 && 'text-foreground font-medium')}>
                <TaskKey taskKey={taskKey} />
                {title}
            </Sidebar.MenuLabel>
            {unread > 0 ? <UnreadCountChip count={unread} /> : null}
        </>
    );
}

function TaskKey({ taskKey }: { taskKey: string }) {
    return <span className="text-muted me-1.5 tabular-nums">{taskKey}</span>;
}

function noPreload() {}
