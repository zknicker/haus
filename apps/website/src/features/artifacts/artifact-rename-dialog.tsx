import { artifactPathBasename, artifactPathParent, parseArtifactPath } from '@haus/api';
import { Button, FieldError, Form, Input, Label, Modal, TextField } from '@heroui/react';
import * as React from 'react';
import { useArtifactMove } from '../../hooks/artifacts/use-artifact-move.ts';

/** What is being renamed: one file (guarded by its head revision) or a whole folder. */
export type ArtifactRenameTarget =
    | { kind: 'file'; path: string; revisionId: string }
    | { kind: 'folder'; path: string };

/**
 * Renames a file or folder in place: the name changes, the folder it sits in
 * does not. Opened from a row's ⋮ menu or a folder tile's context menu.
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
    const parent = artifactPathParent(target.path);
    const trimmed = name.trim();
    const next = parseArtifactPath(parent ? `${parent}/${trimmed}` : trimmed);
    const issue = trimmed.includes('/')
        ? 'A name cannot contain "/".'
        : next.ok || trimmed === ''
          ? null
          : next.message;
    const unchanged = next.ok && next.path === target.path;
    const canSubmit = next.ok && !issue && !unchanged && !move.isPending;
    const noun = target.kind === 'file' ? 'file' : 'folder';

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!(canSubmit && next.ok)) {
            return;
        }
        try {
            await move.move({
                from: target.path,
                to: next.path,
                // A case-only rename is still a rename; the head guard only applies to files.
                ...(target.kind === 'file' ? { base_revision_id: target.revisionId } : {}),
            });
            onClose();
        } catch {
            // The message renders below the field.
        }
    }

    return (
        <>
            <Modal.Header>
                <Modal.Heading>Rename {noun}</Modal.Heading>
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
                            onFocus={(event) => selectStem(event.currentTarget, target)}
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

/** Like Finder: a file's name is selected up to its extension, a folder's in full. */
function selectStem(input: HTMLInputElement, target: ArtifactRenameTarget) {
    const dot = input.value.lastIndexOf('.');
    const end = target.kind === 'file' && dot > 0 ? dot : input.value.length;
    input.setSelectionRange(0, end);
}
