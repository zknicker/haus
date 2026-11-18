import { artifactPathBasename } from '@haus/api';
import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { useArtifactMove } from '../../hooks/artifacts/use-artifact-move.ts';
import {
    type ArtifactRenameTarget,
    renameCandidate,
    renameMove,
    selectRenameStem,
} from './artifact-rename.ts';

/**
 * Renames a file from its viewer: the name changes, the folder it sits in
 * does not. The library renames inline instead (`ArtifactInlineRename`); the
 * viewer's heading is the file's title, not its name, so it has no name to
 * edit in place.
 */
export function ArtifactRenameDialog({
    onClose,
    serverId,
    target,
}: {
    onClose: () => void;
    serverId: string;
    target: ArtifactRenameTarget | null;
}) {
    return (
        <Modal.Backdrop
            isDismissable
            isOpen={target !== null}
            onOpenChange={(open) => !open && onClose()}
        >
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {/* Mounted only while open so each rename starts from the current name. */}
                    {target ? (
                        <RenameForm onClose={onClose} serverId={serverId} target={target} />
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function RenameForm({
    onClose,
    serverId,
    target,
}: {
    onClose: () => void;
    serverId: string;
    target: ArtifactRenameTarget;
}) {
    const move = useArtifactMove(serverId);
    const [name, setName] = React.useState(artifactPathBasename(target.path));
    const candidate = renameCandidate(target, name);
    const issue = candidate.status === 'invalid' ? candidate.message : null;
    const canSubmit = candidate.status === 'ready' && !move.isPending;

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        // The Enter that submits must not travel on to whatever regains focus.
        event.stopPropagation();
        if (!(canSubmit && candidate.status === 'ready')) {
            return;
        }
        try {
            await move.move(renameMove(target, candidate.to));
            onClose();
        } catch {
            // The message renders below the field.
        }
    }

    return (
        <>
            <Modal.Header>
                <Modal.Heading>Rename {target.kind}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
                <Form id="artifact-rename-form" onSubmit={submit}>
                    <TextField
                        fullWidth
                        isInvalid={Boolean(issue || move.error)}
                        onChange={(value) => {
                            setName(value);
                            move.reset();
                        }}
                        value={name}
                        variant="secondary"
                    >
                        <Label>Name</Label>
                        <Input
                            autoFocus
                            onFocus={(event) => selectRenameStem(event.currentTarget, target.kind)}
                        />
                        {issue || move.error ? (
                            <FieldError>{issue ?? move.error}</FieldError>
                        ) : null}
                    </TextField>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" type="button" variant="secondary">
                    Cancel
                </Button>
                <Button
                    form="artifact-rename-form"
                    isDisabled={!canSubmit}
                    isPending={move.isPending}
                    type="submit"
                >
                    Rename
                </Button>
            </Modal.Footer>
        </>
    );
}
