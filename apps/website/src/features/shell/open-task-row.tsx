import { Sidebar } from '@heroui-pro/react';
import { UnreadCountChip } from '../../components/chats/unread-count-chip.tsx';
import { useUnreadPreview } from '../../hooks/inbox/use-unread-previews.ts';
import { useSidebarNavigate } from '../../hooks/shell/sidebar-navigate.tsx';
import { usePressNavigationWith } from '../../hooks/shell/use-press-navigation.ts';
import { useOpenTaskEntry } from '../../hooks/tasks/use-open-tasks.ts';
import { cn } from '../../lib/utils.ts';
import { taskRoute } from '../servers/server-routes.ts';
import { taskStateLabels } from '../tasks/task-state.ts';
import { TaskStateDisc } from '../tasks/task-state-disc.tsx';

/**
 * One open Task at channel-row density (ADR 0052 decision 8): its state mark,
 * its key and title on one line, and an unread count only while the viewer
 * follows it and has something waiting there (decision 9). Everyone else sees
 * a quiet row.
 */
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

/**
 * The title and the unread count. A followed Task with unread messages is an
 * Inbox row, so its unread preview is the one fact both surfaces read.
 */
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
            <Sidebar.MenuLabel className={cn(unread > 0 && 'font-medium text-foreground')}>
                <TaskKey taskKey={taskKey} />
                {title}
            </Sidebar.MenuLabel>
            {unread > 0 ? <UnreadCountChip count={unread} /> : null}
        </>
    );
}

/** The key leads the title in the same truncating line, quieter than it. */
function TaskKey({ taskKey }: { taskKey: string }) {
    return <span className="me-1.5 text-muted tabular-nums">{taskKey}</span>;
}

function noPreload() {}
