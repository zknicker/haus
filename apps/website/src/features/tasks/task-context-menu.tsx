import type { BoardColumn, Task } from '@haus/api';
import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    ArrowRight02Icon,
    CircleArrowUpRightIcon,
    CopyLinkIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { ColumnCategoryDisc } from './column-category-disc.tsx';
import { copyTaskReference } from './copy-task-reference.ts';
import { useMoveTaskAction } from './use-move-task-action.ts';

/** What a right-click on a card or a list row reaches, drag's keyboard-free twin included. */
export function TaskContextMenu({
    children,
    columns,
    onOpen,
    task,
}: {
    children: React.ReactNode;
    columns: readonly BoardColumn[];
    onOpen: () => void;
    task: Task;
}) {
    const moveTask = useMoveTaskAction();
    const onAction = (key: React.Key) => {
        if (key === 'open') {
            onOpen();
        } else if (key === 'copy-reference') {
            copyTaskReference(task.key);
        }
    };

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="block w-full min-w-0">{children}</ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item id="open" textValue="Open task">
                        <Icon aria-hidden="true" icon={CircleArrowUpRightIcon} size={16} />
                        <Label>Open task</Label>
                    </ContextMenu.Item>
                    <ContextMenu.SubmenuTrigger>
                        <ContextMenu.Item id="move" textValue="Move to">
                            <Icon aria-hidden="true" icon={ArrowRight02Icon} size={16} />
                            <Label>Move to</Label>
                            <ContextMenu.SubmenuIndicator />
                        </ContextMenu.Item>
                        <ContextMenu.Popover>
                            <ContextMenu.Menu
                                disabledKeys={[task.columnId]}
                                onAction={(key) => moveTask(task, String(key))}
                            >
                                {columns.map((column) => (
                                    <ContextMenu.Item
                                        id={column.id}
                                        key={column.id}
                                        textValue={column.name}
                                    >
                                        <ColumnCategoryDisc category={column.category} />
                                        <Label>{column.name}</Label>
                                    </ContextMenu.Item>
                                ))}
                            </ContextMenu.Menu>
                        </ContextMenu.Popover>
                    </ContextMenu.SubmenuTrigger>
                    <ContextMenu.Separator />
                    <ContextMenu.Item id="copy-reference" textValue="Copy reference">
                        <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                        <Label>Copy reference</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
