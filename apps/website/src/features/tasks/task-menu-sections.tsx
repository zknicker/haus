import type { Task } from '@haus/api';
import { Dropdown, Header, Label, Separator } from '@heroui/react';
import { CopyLinkIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { copyTaskReference } from './copy-task-reference.ts';
import { useChangeTaskState } from './task-properties.tsx';
import { TaskStateDisc } from './task-state-disc.tsx';
import { isTaskState, taskStateLabels, taskStateOf, taskStateOrder } from './task-state.ts';

export function TaskMenuSections({ task }: { task: Task }) {
    const changeState = useChangeTaskState();
    const state = taskStateOf(task);
    const isHistory = task.chatId === null;

    return (
        <>
            <Dropdown.Section
                disallowEmptySelection
                onSelectionChange={(keys) => {
                    const next = keys === 'all' ? null : [...keys][0];
                    if (isTaskState(next) && next !== state) {
                        changeState(task, next);
                    }
                }}
                selectedKeys={new Set([state])}
                selectionMode="single"
            >
                <Header>State</Header>
                {taskStateOrder.map((option) => (
                    <Dropdown.Item
                        id={option}
                        isDisabled={isHistory}
                        key={option}
                        textValue={taskStateLabels[option]}
                    >
                        <TaskStateDisc state={option} />
                        <Label>{taskStateLabels[option]}</Label>
                        <Dropdown.ItemIndicator />
                    </Dropdown.Item>
                ))}
            </Dropdown.Section>
            <Separator />
            <Dropdown.Section>
                <Dropdown.Item
                    id="copy-reference"
                    onAction={() => copyTaskReference(task)}
                    textValue="Copy reference"
                >
                    <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                    <Label>Copy reference</Label>
                </Dropdown.Item>
            </Dropdown.Section>
        </>
    );
}
