import { BOARD_KEY_PATTERN, type Board, GENERAL_BOARD_KEY } from '@haus/api';
import { Button, Form, Input, Modal, Separator, TextField } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import * as React from 'react';
import { useSetBoardColumns } from '../../hooks/boards/use-set-board-columns.ts';
import { useUpdateBoard } from '../../hooks/boards/use-update-board.ts';
import { useTasks } from '../../hooks/tasks/use-tasks.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import { ArchiveBoardDialog } from './archive-board-dialog.tsx';
import { BoardColumnEditor } from './board-column-editor.tsx';
import {
    type ColumnDraft,
    type ColumnRemoval,
    columnPlanInput,
    columnPlanProblem,
    columnsChanged,
    toColumnDrafts,
} from './board-column-plan.ts';

/** A board's name, key, and columns. Nothing saves until Save, so one version guards the whole edit. */
export function BoardSettingsDialog({
    board,
    onOpenChange,
    open,
}: {
    board: Board;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <BoardSettingsForm board={board} onDone={() => onOpenChange(false)} />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

/** Mounts with the dialog: the draft is a snapshot of the board as it opened. */
function BoardSettingsForm({ board, onDone }: { board: Board; onDone: () => void }) {
    const update = useUpdateBoard();
    const setColumns = useSetBoardColumns();
    const tasks = useTasks({ boardId: board.id, serverId: board.serverId }).data;
    const [opened] = React.useState(board);
    const [name, setName] = React.useState(board.name);
    const [key, setKey] = React.useState(board.key);
    const [drafts, setDrafts] = React.useState<ColumnDraft[]>(() => toColumnDrafts(board.columns));
    const [removals, setRemovals] = React.useState<ColumnRemoval[]>([]);
    const [archiving, setArchiving] = React.useState(false);
    const isGeneral = opened.key === GENERAL_BOARD_KEY;
    const problem = columnPlanProblem(drafts, removals);
    const trimmedName = name.trim();
    const metaChanged = trimmedName !== opened.name || key !== opened.key;
    const changed = metaChanged || columnsChanged(opened, drafts);
    const canSave =
        changed && problem === null && trimmedName.length > 0 && BOARD_KEY_PATTERN.test(key);
    const taskCounts = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const task of tasks ?? []) {
            counts.set(task.columnId, (counts.get(task.columnId) ?? 0) + 1);
        }
        return counts;
    }, [tasks]);
    const error = setColumns.error ?? update.error;

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const identity = { boardId: opened.id, serverId: opened.serverId };
        let version = opened.version;
        if (columnsChanged(opened, drafts)) {
            const result = await setColumns.mutateAsync({
                ...identity,
                ...columnPlanInput(drafts, removals),
                expectedVersion: version,
            });
            version = result.board.version;
        }
        // Last, because a new key moves the board out from under this route.
        if (metaChanged) {
            await update.mutateAsync({
                ...identity,
                expectedVersion: version,
                patch: {
                    ...(key === opened.key ? {} : { key }),
                    ...(trimmedName === opened.name ? {} : { name: trimmedName }),
                },
            });
        }
        onDone();
    }

    return (
        <>
            <Modal.Header>
                <Modal.Heading>Board settings</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <Form className="grid gap-6" id="board-settings-form" onSubmit={save}>
                    <ItemCardGroup>
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Name</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <TextField
                                    aria-label="Board name"
                                    onChange={setName}
                                    value={name}
                                    variant="secondary"
                                >
                                    <Input />
                                </TextField>
                            </ItemCard.Action>
                        </ItemCard>
                        <Separator />
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Key</ItemCard.Title>
                                {isGeneral ? (
                                    <ItemCard.Description>
                                        The General board keeps its key.
                                    </ItemCard.Description>
                                ) : null}
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <TextField
                                    aria-label="Board key"
                                    isDisabled={isGeneral}
                                    onChange={(value) => setKey(value.toUpperCase())}
                                    value={key}
                                    variant="secondary"
                                >
                                    <Input maxLength={5} />
                                </TextField>
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                    <BoardColumnEditor
                        drafts={drafts}
                        onDraftsChange={setDrafts}
                        onRemovalsChange={setRemovals}
                        removals={removals}
                        taskCounts={taskCounts}
                    />
                    {isGeneral ? null : (
                        <ItemCardGroup>
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>Archive board</ItemCard.Title>
                                </ItemCard.Content>
                                <ItemCard.Action>
                                    <Button
                                        onPress={() => setArchiving(true)}
                                        size="sm"
                                        variant="danger-soft"
                                    >
                                        Archive
                                    </Button>
                                </ItemCard.Action>
                            </ItemCard>
                        </ItemCardGroup>
                    )}
                    <SettingsRowError>{error?.message ?? problem}</SettingsRowError>
                </Form>
                <ArchiveBoardDialog board={board} isOpen={archiving} onOpenChange={setArchiving} />
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="board-settings-form"
                    isDisabled={!canSave}
                    isPending={setColumns.isPending || update.isPending}
                    type="submit"
                >
                    Save
                </Button>
            </Modal.Footer>
        </>
    );
}
