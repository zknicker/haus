import { Label, ListBox } from '@heroui/react';

import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { type TaskPriority, taskPriorityLabels, taskPriorityOrder } from './task-presentation.ts';
import { TaskPriorityIcon } from './task-priority-icon.tsx';
import type { TaskPerson } from './use-task-people.ts';

/**
 * The option lists every Task surface shares, so a person and a priority read
 * the same in a Tasks page filter and on the Task page.
 */

export function PersonListBox({
    leading,
    people,
}: {
    /** Non-person choices ahead of the people: Anyone, Unassigned. */
    leading: readonly { id: string; label: string }[];
    people: readonly TaskPerson[];
}) {
    return (
        <ListBox>
            {leading.map((option) => (
                <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                    <Label>{option.label}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
            {people.map((person) => (
                <ListBox.Item id={person.key} key={person.key} textValue={person.label}>
                    <EntityAvatar name={person.label} size={20} src={person.avatarUrl} />
                    <Label className="truncate">{person.label}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
}

export function PriorityListBox() {
    return (
        <ListBox>
            {taskPriorityOrder.map((priority) => (
                <ListBox.Item id={priority} key={priority} textValue={taskPriorityLabels[priority]}>
                    <TaskPriorityIcon className="text-muted" priority={priority} />
                    <Label>{taskPriorityLabels[priority]}</Label>
                    <ListBox.ItemIndicator />
                </ListBox.Item>
            ))}
        </ListBox>
    );
}

export function isTaskPriority(value: unknown): value is TaskPriority {
    return taskPriorityOrder.includes(value as TaskPriority);
}
