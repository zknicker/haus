import { parseTaskKey, type TaskInboxItem } from '@haus/api';
import * as React from 'react';
import { createTaskAssignmentNotifier } from '../../features/notifications/task-assignment-notifier.ts';
import { taskRoute } from '../../features/servers/server-routes.ts';
import { useMembers } from '../servers/use-members.ts';
import { useTaskInboxItems } from '../task-inbox/use-task-inbox-items.ts';
import type { NotificationSurface } from './use-notification-surface.ts';

/**
 * Raises a platform notification for a Task someone else assigned this human
 * (ADR 0051), while Haus is hidden or unfocused; clicking one opens the Task.
 * It adds no read of its own: it rides the `taskInbox.list` the badge already
 * keeps current, and the caller hands `changed` to the Server's single
 * `taskInbox.onChanged` stream.
 */
export function useTaskAssignmentNotifications(
    server: { id: string; slug: string },
    surface: NotificationSurface
) {
    const viewerUserId = useMembers(server.id).data?.viewerUserId;
    const latest = React.useRef({ slug: server.slug, viewerUserId });
    latest.current = { slug: server.slug, viewerUserId };

    // One notifier per mount; `MessageNotifications` is keyed by Server, so
    // switching Servers starts with nothing seen.
    const [notifier] = React.useState(() =>
        createTaskAssignmentNotifier({
            ...surface,
            pathOf: (item) => taskPath(item, latest.current.slug),
            viewerUserId: () => latest.current.viewerUserId,
        })
    );

    const items = useTaskInboxItems(server.id).data;
    React.useEffect(() => {
        if (items) {
            notifier.listRead(items);
        }
    }, [items, notifier]);

    return notifier;
}

function taskPath({ task }: TaskInboxItem, slug: string) {
    const address = parseTaskKey(task.key);
    return address ? taskRoute(slug, address.boardKey, address.number) : null;
}
