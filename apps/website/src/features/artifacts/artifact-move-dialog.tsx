import { artifactPathBasename, artifactPathParent } from '@haus/api';
import { Breadcrumbs, Button, Label, ListBox, Modal } from '@heroui/react';
import * as React from 'react';
import { useArtifactFolders } from '../../hooks/artifacts/use-artifact-folders.ts';
import { useArtifactMove } from '../../hooks/artifacts/use-artifact-move.ts';
import type { ArtifactRenameTarget } from './artifact-rename.ts';
import { artifactFolderCrumbs, artifactMoveTarget } from './drive-folders.ts';

/** What Move to… moves: the same shape as a rename, a file guarded by its head revision. */
export type ArtifactMoveTarget = ArtifactRenameTarget;

/**
 * Move to…: a folder picker that starts in the item's own folder. Pressing a
 * folder walks into it, the trail walks back out, and Move here keeps the
 * item's name. A folder never lists itself, so it cannot move into itself.
 */
export function ArtifactMoveDialog({
    onClose,
    serverId,
    target,
}: {
    onClose: () => void;
    serverId: string;
    target: ArtifactMoveTarget | null;
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
                    {target ? (
                        <MoveForm onClose={onClose} serverId={serverId} target={target} />
                    ) : null}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

function MoveForm({
    onClose,
    serverId,
    target,
}: {
    onClose: () => void;
    serverId: string;
    target: ArtifactMoveTarget;
}) {
    const [folder, setFolder] = React.useState(artifactPathParent(target.path));
    const children = useArtifactFolders(serverId, folder);
    const move = useArtifactMove(serverId);
    const destination = artifactMoveTarget(target.path, folder);
    const choices = (children.folders ?? []).filter((entry) => entry.path !== target.path);
    const browse = (next: string) => {
        move.reset();
        setFolder(next);
    };

    async function submit() {
        if (!destination) {
            return;
        }
        try {
            await move.move({
                from: target.path,
                to: destination,
                ...(target.kind === 'file' ? { base_revision_id: target.revisionId } : {}),
            });
            onClose();
        } catch {
            // The message renders in the body.
        }
    }

    return (
        <>
            <Modal.Header>
                <Modal.Heading>Move “{artifactPathBasename(target.path)}”</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
                <nav aria-label="Destination folder">
                    <Breadcrumbs>
                        <Breadcrumbs.Item onPress={folder ? () => browse('') : undefined}>
                            Files
                        </Breadcrumbs.Item>
                        {artifactFolderCrumbs(folder).map((crumb) => (
                            <Breadcrumbs.Item
                                key={crumb.path}
                                onPress={
                                    crumb.path === folder ? undefined : () => browse(crumb.path)
                                }
                            >
                                {crumb.label}
                            </Breadcrumbs.Item>
                        ))}
                    </Breadcrumbs>
                </nav>
                {children.folders && choices.length === 0 ? (
                    <p className="text-muted text-sm">No folders inside.</p>
                ) : (
                    <ListBox
                        aria-label="Folders"
                        items={choices.map((entry) => ({ ...entry, id: entry.path }))}
                        onAction={(key) => browse(String(key))}
                    >
                        {(entry) => (
                            <ListBox.Item id={entry.path} textValue={entry.name}>
                                <Label>{entry.name}</Label>
                            </ListBox.Item>
                        )}
                    </ListBox>
                )}
                {move.error ? (
                    <p className="text-danger text-sm" role="alert">
                        {move.error}
                    </p>
                ) : null}
            </Modal.Body>
            <Modal.Footer>
                <Button slot="close" variant="secondary">
                    Cancel
                </Button>
                <Button
                    isDisabled={destination === null}
                    isPending={move.isPending}
                    onPress={() => void submit()}
                >
                    Move here
                </Button>
            </Modal.Footer>
        </>
    );
}
