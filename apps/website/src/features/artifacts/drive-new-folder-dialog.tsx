import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { newFolderCandidate } from './drive-new-file.ts';

export function DriveNewFolderDialog({
    error,
    isPending,
    onClose,
    onCreate,
    parent,
}: {
    error: string | null;
    isPending: boolean;
    onClose: () => void;
    onCreate: (name: string) => void;
    parent: string | null;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={parent !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {parent === null ? null : (
                        <NewFolderForm
                            error={error}
                            isPending={isPending}
                            onCreate={onCreate}
                            parent={parent}
                        />
                    )}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function NewFolderForm({
    error,
    isPending,
    onCreate,
    parent,
}: {
    error: string | null;
    isPending: boolean;
    onCreate: (name: string) => void;
    parent: string;
}) {
    const [name, setName] = React.useState('');
    const [typed, setTyped] = React.useState(false);
    const candidate = newFolderCandidate(parent, name, []);
    const issue = candidate.status === 'invalid' ? candidate.message : typed ? null : error;
    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (candidate.status === 'ready' && !isPending) {
            setTyped(false);
            onCreate(name);
        }
    };
    return (
        <>
            <Modal.Header>
                <Modal.Heading>New folder</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <Form id="drive-new-folder-form" onSubmit={submit}>
                    <TextField
                        fullWidth
                        isInvalid={issue !== null}
                        onChange={(value) => {
                            setName(value);
                            setTyped(true);
                        }}
                        value={name}
                        variant="secondary"
                    >
                        <Label>Name</Label>
                        <Input autoFocus />
                        {issue ? <FieldError>{issue}</FieldError> : null}
                    </TextField>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="drive-new-folder-form"
                    isDisabled={candidate.status !== 'ready'}
                    isPending={isPending}
                    type="submit"
                >
                    Create
                </Button>
            </Modal.Footer>
        </>
    );
}
