import type { Task } from '@haus/api';
import { Button, Dropdown } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { TaskMenuSections } from './task-menu-sections.tsx';

export function TaskRowMenu({ task }: { task: Task }) {
    return (
        <Dropdown>
            <Button aria-label={`${task.title} actions`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu aria-label={`${task.title} actions`}>
                    <TaskMenuSections task={task} />
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
