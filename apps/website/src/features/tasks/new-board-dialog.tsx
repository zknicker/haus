import { BOARD_KEY_PATTERN, type Board } from '@haus/api';
import { Button, Form, Input, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { useCreateBoard } from '../../hooks/boards/use-create-board.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';
import { suggestBoardKey } from './board-column-plan.ts';

/** Creates a board with its default columns. The sidebar's New board row opens it. */
export function NewBoardDialog({
    onCreated,
    onOpenChange,
    open,
    serverId,
}: {
    onCreated: (board: Board) => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    serverId: string;
}) {
    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container>
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <NewBoardForm onCreated={onCreated} serverId={serverId} />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function NewBoardForm({
    onCreated,
    serverId,
}: {
    onCreated: (board: Board) => void;
    serverId: string;
}) {
    const create = useCreateBoard();
    const [name, setName] = React.useState('');
    // The key follows the name until the reader types one of their own.
    const [typedKey, setTypedKey] = React.useState<null | string>(null);
    const key = typedKey ?? suggestBoardKey(name);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        const { board } = await create.mutateAsync({ key, name: name.trim(), serverId });
        onCreated(board);
    }

    return (
        <>
            <Modal.Header>
                <Modal.Heading>New board</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <Form className="grid gap-3" id="new-board-form" onSubmit={submit}>
                    <TextField fullWidth onChange={setName} value={name} variant="secondary">
                        <Label>Name</Label>
                        <Input autoFocus placeholder="Security" />
                    </TextField>
                    <TextField
                        fullWidth
                        onChange={(value) => setTypedKey(value.toUpperCase())}
                        value={key}
                        variant="secondary"
                    >
                        <Label>Key</Label>
                        <Input maxLength={5} placeholder="SEC" />
                    </TextField>
                    <SettingsRowError>{create.error?.message}</SettingsRowError>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="new-board-form"
                    isDisabled={!(name.trim() && BOARD_KEY_PATTERN.test(key))}
                    isPending={create.isPending}
                    type="submit"
                >
                    Create board
                </Button>
            </Modal.Footer>
        </>
    );
}
