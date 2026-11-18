import { Sidebar } from '@heroui-pro/react';
import { useOpenTaskIds } from '../../hooks/tasks/use-open-tasks.ts';
import { ChatGroup } from './chat-navigation-group.tsx';
import { OpenTaskRow } from './open-task-row.tsx';

/**
 * Every open Task on the Server (ADR 0052 decision 8). Todo Tasks are not
 * listed, and a Task leaves as soon as it is done or canceled; recently
 * closed ones are on the Tasks page. It reads only its row order; each row
 * reads its own entry. Nothing renders until the read settles, and nothing at
 * all while no Task is open.
 */
export function OpenTasksSection({
    currentPath,
    serverId,
    slug,
}: {
    currentPath: string;
    serverId: string;
    slug: string;
}) {
    const taskIds = useOpenTaskIds(serverId);
    if (!taskIds || taskIds.length === 0) {
        return null;
    }
    return (
        <ChatGroup label="Tasks">
            <Sidebar.Menu aria-label="Open tasks">
                {taskIds.map((taskId) => (
                    <OpenTaskRow
                        currentPath={currentPath}
                        key={taskId}
                        serverId={serverId}
                        slug={slug}
                        taskId={taskId}
                    />
                ))}
            </Sidebar.Menu>
        </ChatGroup>
    );
}
