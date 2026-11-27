import type { TaskDetail } from '@haus/api';
import { Button } from '@heroui/react';
import { Archive02Icon, ArrowTurnBackwardIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { useSetTaskArchived } from '../../../hooks/tasks/use-set-task-archived.ts';

export function TaskArchiveAction({
    task,
}: {
    task: Pick<TaskDetail, 'archivedAt' | 'id' | 'serverId' | 'version'>;
}) {
    const archive = useSetTaskArchived();
    const archived = task.archivedAt !== null;
    return (
        <div className="flex px-2">
            <Button
                isPending={archive.isPending}
                onPress={() => archive.set(task, !archived)}
                size="sm"
                variant="secondary"
            >
                <Icon
                    aria-hidden="true"
                    icon={archived ? ArrowTurnBackwardIcon : Archive02Icon}
                    size={16}
                />
                {archived ? 'Restore' : 'Archive'}
            </Button>
        </div>
    );
}
