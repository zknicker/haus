import type { Task } from '@haus/api';
import { Button, Dropdown } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { RenameTaskDialog } from './rename-task-dialog.tsx';
import { TaskMenuSections } from './task-menu-sections.tsx';

export function TaskMenu({ task }: { task: Task }) {
    const [renaming, setRenaming] = React.useState(false);
    return (
        <>
            <Dropdown>
                <Button aria-label={`${task.title} actions`} isIconOnly size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                </Button>
                <Dropdown.Popover placement="bottom end">
                    <Dropdown.Menu aria-label={`${task.title} actions`}>
                        <TaskMenuSections onRename={() => setRenaming(true)} task={task} />
                    </Dropdown.Menu>
                </Dropdown.Popover>
            </Dropdown>
            {renaming ? <RenameTaskDialog onClose={() => setRenaming(false)} task={task} /> : null}
        </>
    );
}
