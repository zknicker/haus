import { artifactPathBasename, artifactPathKey, artifactPathParent } from '@haus/api';
import { Breadcrumbs, Button, Label, ListBox, Modal } from '@heroui/react';
import * as React from 'react';
import { useArtifactFolders } from '../../hooks/artifacts/use-artifact-folders.ts';
import { useArtifactMoveMany } from '../../hooks/artifacts/use-artifact-move-many.ts';
import type { ArtifactRenameTarget } from './artifact-rename.ts';
import { artifactFolderCrumbs } from './drive-folders.ts';
import { bulkMovePaths } from './library-bulk.ts';

/** What Move to… moves: one item or a selection, each file guarded by its head revision. */
export type ArtifactMoveTarget = readonly ArtifactRenameTarget[];

/**
 * Move to…: a folder picker that starts in the first item's folder. Pressing
 * a folder walks into it, the trail walks back out, and Move here moves every
 * item in one request, keeping their names. A selected folder never lists
 * itself, so nothing can move into itself.
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
            isOpen={target !== null && target.length > 0}
            onOpenChange={(open) => !open && onClose()}
        >
            <Modal.Container size="sm">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    {target && target.length > 0 ? (
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
    const [folder, setFolder] = React.useState(artifactPathParent(target[0]?.path ?? ''));
    const children = useArtifactFolders(serverId, folder);
    const move = useArtifactMoveMany(serverId);
    const paths = target.map((item) => item.path);
    const moving = bulkMovePaths(paths, folder);
    const selected = new Set(paths.map(artifactPathKey));
    const choices = (children.folders ?? []).filter(
        (entry) => !selected.has(artifactPathKey(entry.path))
    );
    const browse = (next: string) => {
        move.reset();
        setFolder(next);
    };

    async function submit() {
        if (!moving) {
            return;
        }
        const keys = new Set(moving.map(artifactPathKey));
        try {
            await move.moveMany(
                target.filter((item) => keys.has(artifactPathKey(item.path))),
                folder
            );
            onClose();
        } catch {
            // The message renders in the body.
        }
    }

    const [only] = target;
    return (
        <>
            <Modal.Header>
                <Modal.Heading>
                    {target.length === 1 && only
                        ? `Move “${artifactPathBasename(only.path)}”`
                        : `Move ${target.length} items`}
                </Modal.Heading>
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
                    isDisabled={moving === null}
                    isPending={move.isPending}
                    onPress={() => void submit()}
                >
                    Move here
                </Button>
            </Modal.Footer>
        </>
    );
}
