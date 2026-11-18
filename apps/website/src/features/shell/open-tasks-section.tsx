import { Sidebar } from '@heroui-pro/react';

import { useOpenTaskIds } from '../../hooks/tasks/use-open-tasks.ts';
import { ChatGroup } from './chat-navigation-group.tsx';
import { OpenTaskRow } from './open-task-row.tsx';

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
