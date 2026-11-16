import type { Board, BoardColumn } from '@haus/api';
import { Button, Form, Input, Label, Modal, TextArea, TextField } from '@heroui/react';
import { InlineSelect } from '@heroui-pro/react/inline-select';
import { Plus } from '@hugeicons/core-free-icons';
import * as React from 'react';
import { EntityName } from '../../components/ui/entity-name.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useCreateTask } from '../../hooks/tasks/use-create-task.ts';
import { useServerContext } from '../servers/server-context.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import { assigneeFromKey, unassignedKey } from './board-view.ts';
import { ColumnCategoryDisc } from './column-category-disc.tsx';
import { ColumnListBox, isTaskPriority, PersonListBox, PriorityListBox } from './task-pickers.tsx';
import { type TaskPriority, taskPriorityLabels } from './task-presentation.ts';
import { TaskPriorityIcon } from './task-priority-icon.tsx';
import { useTaskPeople } from './use-task-people.ts';

/**
 * The way into a new Task: the band's button, or a column's add button, which
 * starts the dialog on that column. Each owns its dialog, so nothing above the
 * column has to know one is open.
 */
export function NewTaskButton({ board, column }: { board: Board; column?: BoardColumn }) {
    const [open, setOpen] = React.useState(false);

    return (
        <>
            {column ? (
                <Button
                    aria-label={`Add task to ${column.name}`}
                    isIconOnly
                    onPress={() => setOpen(true)}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Plus} size={16} />
                </Button>
            ) : (
                <Button onPress={() => setOpen(true)} size="sm" variant="primary">
                    New task
                </Button>
            )}
            <Modal.Backdrop isDismissable isOpen={open} onOpenChange={setOpen}>
                <Modal.Container>
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <NewTaskForm board={board} column={column} onDone={() => setOpen(false)} />
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </>
    );
}

/** Mounts with the dialog, so every opening starts from an empty draft. */
function NewTaskForm({
    board,
    column,
    onDone,
}: {
    board: Board;
    column: BoardColumn | undefined;
    onDone: () => void;
}) {
    const { server } = useServerContext();
    const create = useCreateTask();
    const people = useTaskPeople(server.id);
    const [title, setTitle] = React.useState('');
    const [description, setDescription] = React.useState('');
    const [columnId, setColumnId] = React.useState(column?.id ?? firstTodoColumnId(board));
    const [assignee, setAssignee] = React.useState(unassignedKey);
    const [priority, setPriority] = React.useState<TaskPriority>('none');
    const selectedColumn = board.columns.find((candidate) => candidate.id === columnId);
    const selectedPerson = people.find((person) => person.key === assignee);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const assigned = assigneeFromKey(assignee);
        await create.mutateAsync({
            ...(assigned ? { assignee: assigned } : {}),
            ...(description.trim() ? { description } : {}),
            ...(priority === 'none' ? {} : { priority }),
            boardId: board.id,
            columnId,
            serverId: server.id,
            title: title.trim(),
        });
        onDone();
    }

    return (
        <>
            <Modal.Header>
                <Modal.Heading>New task</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <Form className="grid gap-3" id="new-task-form" onSubmit={submit}>
                    <TextField fullWidth onChange={setTitle} value={title} variant="secondary">
                        <Label>Title</Label>
                        <Input autoFocus placeholder="What needs to be done?" />
                    </TextField>
                    <TextField
                        fullWidth
                        onChange={setDescription}
                        value={description}
                        variant="secondary"
                    >
                        <Label>Description</Label>
                        <TextArea rows={4} />
                    </TextField>
                    <div className="flex flex-wrap items-center gap-3">
                        <InlineSelect
                            aria-label="Column"
                            onChange={(next) => next && setColumnId(String(next))}
                            value={columnId}
                        >
                            <InlineSelect.Trigger className="gap-1.5">
                                {selectedColumn ? (
                                    <ColumnCategoryDisc category={selectedColumn.category} />
                                ) : null}
                                <span className="truncate text-sm">{selectedColumn?.name}</span>
                                <InlineSelect.Indicator />
                            </InlineSelect.Trigger>
                            <InlineSelect.Popover className="w-56" placement="bottom start">
                                <ColumnListBox columns={board.columns} />
                            </InlineSelect.Popover>
                        </InlineSelect>
                        <InlineSelect
                            aria-label="Assignee"
                            onChange={(next) => next && setAssignee(String(next))}
                            value={assignee}
                        >
                            <InlineSelect.Trigger className="gap-1.5">
                                {selectedPerson ? (
                                    <EntityName
                                        avatarUrl={selectedPerson.avatarUrl}
                                        className="text-sm"
                                        name={selectedPerson.label}
                                        size={18}
                                    />
                                ) : (
                                    <span className="truncate text-sm">Unassigned</span>
                                )}
                                <InlineSelect.Indicator />
                            </InlineSelect.Trigger>
                            <InlineSelect.Popover className="w-56" placement="bottom start">
                                <PersonListBox
                                    leading={[{ id: unassignedKey, label: 'Unassigned' }]}
                                    people={people}
                                />
                            </InlineSelect.Popover>
                        </InlineSelect>
                        <InlineSelect
                            aria-label="Priority"
                            onChange={(next) => isTaskPriority(next) && setPriority(next)}
                            value={priority}
                        >
                            <InlineSelect.Trigger className="gap-1.5">
                                <TaskPriorityIcon className="text-muted" priority={priority} />
                                <span className="truncate text-sm">
                                    {taskPriorityLabels[priority]}
                                </span>
                                <InlineSelect.Indicator />
                            </InlineSelect.Trigger>
                            <InlineSelect.Popover className="w-44" placement="bottom start">
                                <PriorityListBox />
                            </InlineSelect.Popover>
                        </InlineSelect>
                    </div>
                    <SettingsRowError>{create.error?.message}</SettingsRowError>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="new-task-form"
                    isDisabled={!title.trim()}
                    isPending={create.isPending}
                    type="submit"
                >
                    Create task
                </Button>
            </Modal.Footer>
        </>
    );
}

/** `task.create` defaults here too; naming it keeps the dialog's picker honest about where it lands. */
function firstTodoColumnId(board: Board) {
    return board.columns.find((column) => column.category === 'todo')?.id ?? '';
}
