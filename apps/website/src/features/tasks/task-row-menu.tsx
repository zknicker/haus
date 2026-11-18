import type { Task } from '@haus/api';
import { Button, Dropdown, Header, Label, Separator } from '@heroui/react';
import { CopyLinkIcon, MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useAssignTask } from '../../hooks/tasks/use-assign-task.ts';
import { useSetTaskState } from '../../hooks/tasks/use-set-task-state.ts';
import { copyTaskReference } from './copy-task-reference.ts';
import { assigneeFromKey, assigneeKey, unassignedKey } from './task-assignee.ts';
import { changeTaskState } from './task-properties.tsx';
import { isTaskState, taskStateLabels, taskStateOrder } from './task-state.ts';
import { TaskStateDisc } from './task-state-disc.tsx';
import { showTaskUpdateError } from './task-update-error.ts';
import { useTaskPeople } from './use-task-people.ts';

/**
 * A Tasks page row's menu (ADR 0053 decision 10): its state and its assignee,
 * each a single choice, then Copy reference. There is no create and no delete.
 * A chatless Task is read-only history: its state and assignee show, disabled.
 */
export function TaskRowMenu({ task }: { task: Task }) {
    const setState = useSetTaskState();
    const assign = useAssignTask();
    const people = useTaskPeople(task.serverId);
    const current = assigneeKey(task.assignee);
    const isHistory = task.chatId === null;

    return (
        <Dropdown>
            <Button aria-label={`${task.key} actions`} isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                    aria-label={`${task.key} actions`}
                    onAction={(key) => {
                        if (key === 'copy-reference') {
                            copyTaskReference(task.key);
                        }
                    }}
                >
                    <Dropdown.Section
                        disallowEmptySelection
                        onSelectionChange={(keys) => {
                            const next = keys === 'all' ? null : [...keys][0];
                            if (isTaskState(next) && next !== task.state) {
                                changeTaskState(setState.mutate, task, next);
                            }
                        }}
                        selectedKeys={new Set([task.state])}
                        selectionMode="single"
                    >
                        <Header>State</Header>
                        {taskStateOrder.map((state) => (
                            <Dropdown.Item
                                id={state}
                                isDisabled={isHistory}
                                key={state}
                                textValue={taskStateLabels[state]}
                            >
                                <TaskStateDisc state={state} />
                                <Label>{taskStateLabels[state]}</Label>
                                <Dropdown.ItemIndicator />
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Section>
                    <Separator />
                    <Dropdown.Section
                        disallowEmptySelection
                        onSelectionChange={(keys) => {
                            const next = keys === 'all' ? null : [...keys][0];
                            if (next !== undefined && next !== null && String(next) !== current) {
                                assign.mutate(
                                    {
                                        assignee: assigneeFromKey(String(next)),
                                        expectedVersion: task.version,
                                        serverId: task.serverId,
                                        taskId: task.id,
                                    },
                                    { onError: showTaskUpdateError }
                                );
                            }
                        }}
                        selectedKeys={new Set([current])}
                        selectionMode="single"
                    >
                        <Header>Assignee</Header>
                        <Dropdown.Item
                            id={unassignedKey}
                            isDisabled={isHistory}
                            textValue="Unassigned"
                        >
                            <Label>Unassigned</Label>
                            <Dropdown.ItemIndicator />
                        </Dropdown.Item>
                        {people.map((person) => (
                            <Dropdown.Item
                                id={person.key}
                                isDisabled={isHistory}
                                key={person.key}
                                textValue={person.label}
                            >
                                <EntityAvatar
                                    name={person.label}
                                    size={20}
                                    src={person.avatarUrl}
                                />
                                <Label>{person.label}</Label>
                                <Dropdown.ItemIndicator />
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Section>
                    <Separator />
                    <Dropdown.Section>
                        <Dropdown.Item id="copy-reference" textValue="Copy reference">
                            <Icon aria-hidden="true" icon={CopyLinkIcon} size={16} />
                            <Label>Copy reference</Label>
                        </Dropdown.Item>
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
