import { repoFolderPathSchema } from '@haus/api';
import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import { useState } from 'react';
import {
    type RepoFolderTarget,
    useAddRepoFolder,
} from '../../hooks/servers/use-computer-repo-folders.ts';

const formId = 'computer-repo-folder-add-form';

export function ComputerRepoFolderAddDialog({
    onClose,
    target,
}: {
    onClose: () => void;
    target: RepoFolderTarget;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <Modal.Container size="md">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <AddFolderForm onClose={onClose} target={target} />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

export function RepoFolderDisclosure() {
    return (
        <p>
            {'Workers and Captains work in git worktrees of this folder and share its '}
            <code>.git</code>
            {'. A Worker can change its branches, including '}
            <code>main</code>
            {', and its hooks and config.'}
        </p>
    );
}

function AddFolderForm({ onClose, target }: { onClose: () => void; target: RepoFolderTarget }) {
    const add = useAddRepoFolder(target);
    const [path, setPath] = useState('');
    const [invalid, setInvalid] = useState<string | null>(null);
    const error = invalid ?? add.error?.message ?? null;

    const submit = () => {
        const parsed = repoFolderPathSchema.safeParse(path);
        if (!parsed.success) {
            setInvalid('Enter the folder’s full path, starting with /.');
            return;
        }
        add.mutate({ ...target, path: parsed.data }, { onSuccess: onClose });
    };

    return (
        <>
            <Modal.Header>
                <Modal.Heading>Add folder</Modal.Heading>
                <RepoFolderDisclosure />
            </Modal.Header>
            <Modal.Body>
                <Form
                    className="flex flex-col gap-3"
                    id={formId}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (path.trim().length > 0 && !add.isPending) {
                            submit();
                        }
                    }}
                >
                    <TextField
                        autoFocus
                        fullWidth
                        isInvalid={error !== null}
                        onChange={(value) => {
                            setPath(value);
                            setInvalid(null);
                            add.reset();
                        }}
                        value={path}
                        variant="secondary"
                    >
                        <Label>Folder path</Label>
                        <Input autoComplete="off" placeholder="/Users/you/code/haus" />
                        <FieldError>{error}</FieldError>
                    </TextField>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button onPress={onClose} type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form={formId}
                    isDisabled={path.trim().length === 0}
                    isPending={add.isPending}
                    type="submit"
                >
                    Add folder
                </Button>
            </Modal.Footer>
        </>
    );
}
