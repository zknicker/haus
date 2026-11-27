import type { Task } from '@haus/api';
import { Dropdown, Label, Separator } from '@heroui/react';
import {
    Archive02Icon,
    ArrowTurnBackwardIcon,
    CopyLinkIcon,
    PencilEdit02Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useSetTaskArchived } from '../../hooks/tasks/use-set-task-archived.ts';
import { copyTaskReference } from './copy-task-reference.ts';

export function TaskMenuSections({ onRename, task }: { onRename?: () => void; task: Task }) {
    const archive = useSetTaskArchived();
    const archived = task.archivedAt !== null;

    return (
        <>
            <Dropdown.Section>
                {onRename ? (
                    <Dropdown.Item id="rename" onAction={onRename} textValue="Rename">
                        <Icon aria-hidden="true" icon={PencilEdit02Icon} size={16} />
                        <Label>Rename</Label>
                    </Dropdown.Item>
                ) : null}
                <Dropdown.Item
                    id="copy-reference"
                    onAction={() => copyTaskReference(task)}
                    textValue="Copy reference"
                >
                    <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                    <Label>Copy reference</Label>
                </Dropdown.Item>
            </Dropdown.Section>
            <Separator />
            <Dropdown.Section>
                <Dropdown.Item
                    id={archived ? 'restore' : 'archive'}
                    isDisabled={task.chatId === null}
                    onAction={() => archive.set(task, !archived)}
                    textValue={archived ? 'Restore' : 'Archive'}
                >
                    <Icon
                        aria-hidden="true"
                        icon={archived ? ArrowTurnBackwardIcon : Archive02Icon}
                        size={16}
                    />
                    <Label>{archived ? 'Restore' : 'Archive'}</Label>
                </Dropdown.Item>
            </Dropdown.Section>
        </>
    );
}
