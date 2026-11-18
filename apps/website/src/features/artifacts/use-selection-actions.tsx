import { artifactBatchMaxItems, artifactPathKey } from '@haus/api';
import { toast } from '@heroui/react';
import * as React from 'react';
import {
    type ArtifactMoveItem,
    useArtifactMoveMany,
} from '../../hooks/artifacts/use-artifact-move-many.ts';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { useArtifactZipDownload } from '../../hooks/artifacts/use-artifact-zip-download.ts';
import { useServerContext } from '../servers/server-context.ts';
import { appLink } from '../servers/server-routes.ts';
import {
    type ArtifactAction,
    canDeleteArtifact,
    type SelectionActionId,
    selectionActions,
} from './artifact-actions.ts';
import { ArtifactBulkDeleteDialog } from './artifact-bulk-delete-dialog.tsx';
import { copyArtifactLink } from './artifact-link.ts';
import { ArtifactMoveDialog } from './artifact-move-dialog.tsx';
import {
    type BulkDeletePlan,
    bulkDeletePlan,
    bulkDownloadIsZip,
    bulkMovePaths,
    bulkZipSelection,
    selectionLinks,
} from './library-bulk.ts';
import type { LibraryItem } from './library-items.ts';
import { libraryHref } from './library-params.ts';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';

/** What a selection of several items offers, and runs. */
export interface SelectionActions {
    actions: (items: readonly LibraryItem[]) => ArtifactAction<SelectionActionId>[];
    /** Moves `items` into `folder` (a drop); a move into itself or where they already are is a no-op. */
    moveInto: (items: readonly LibraryItem[], folder: string) => void;
    run: (id: SelectionActionId, items: readonly LibraryItem[]) => void;
}

/**
 * The library's bulk actions over a selection: Download (one zip, or the file
 * itself for a lone file), Copy links, Move to…, and Delete… (only the files
 * this member may delete, the Server's rule), plus moves by drag and drop.
 * Each runs as one Server request however many items are selected.
 */
export function useSelectionActions(input: {
    /** The open folder: zip entries are named relative to it. */
    folder: string;
    /** Called once a bulk delete lands, so the library drops the deleted selection. */
    onDeleted: () => void;
    serverId: string;
    slug: string;
}): { dialogs: React.ReactNode; selection: SelectionActions } {
    const { folder, serverId, slug } = input;
    const { server } = useServerContext();
    const directory = useArtifactCreatorDirectory(serverId);
    const { saveFile } = useArtifactSave(serverId);
    const { downloadZip } = useArtifactZipDownload(serverId);
    const move = useArtifactMoveMany(serverId);
    const [moving, setMoving] = React.useState<ArtifactMoveItem[] | null>(null);
    const [deleting, setDeleting] = React.useState<BulkDeletePlan | null>(null);
    const deletePlan = (items: readonly LibraryItem[]) =>
        bulkDeletePlan(items, (file) =>
            canDeleteArtifact({
                creator: file.creator,
                isSelf: directory.isSelf,
                role: server.role,
            })
        );

    const selection: SelectionActions = {
        actions: (items) => selectionActions({ deletable: deletePlan(items).deletable.length }),
        moveInto: (items, to) => {
            const paths = bulkMovePaths(
                items.map((item) => item.path),
                to
            );
            if (!(paths && withinBatch(paths.length))) {
                return;
            }
            const keys = new Set(paths.map(artifactPathKey));
            move.moveMany(
                items.filter((item) => keys.has(artifactPathKey(item.path))).map(moveItem),
                to
            ).catch((error: unknown) => {
                toast.danger('Could not move these items', {
                    description: error instanceof Error ? error.message : undefined,
                });
            });
        },
        run: (id, items) => {
            if (id !== 'copy-links' && !withinBatch(items.length)) {
                return;
            }
            switch (id) {
                case 'download': {
                    const [only] = items;
                    if (only?.kind === 'file' && !bulkDownloadIsZip(items)) {
                        void saveFile({
                            artifactId: only.file.artifact_id,
                            revisionId: only.file.revision_id,
                        });
                    } else if (items.length > 0) {
                        void downloadZip(bulkZipSelection(items, folder));
                    }
                    return;
                }
                case 'copy-links':
                    void copyArtifactLink(
                        selectionLinks(items, (path) =>
                            appLink(libraryHref(slug, { creator: null, folder: path, kind: 'all' }))
                        ),
                        items.length === 1 ? 'Link copied' : `${items.length} links copied`
                    );
                    return;
                case 'move':
                    setMoving(items.map(moveItem));
                    return;
                case 'delete': {
                    const plan = deletePlan(items);
                    if (plan.deletable.length > 0) {
                        setDeleting(plan);
                    } else {
                        toast.info('Nothing here you can delete', {
                            description:
                                'Folders, and files only their creator or an Owner or Admin can delete.',
                        });
                    }
                    return;
                }
            }
        },
    };

    const dialogs = (
        <>
            <ArtifactMoveDialog
                onClose={() => setMoving(null)}
                serverId={serverId}
                target={moving}
            />
            <ArtifactBulkDeleteDialog
                onClose={() => setDeleting(null)}
                onDeleted={input.onDeleted}
                plan={deleting}
                serverId={serverId}
            />
        </>
    );
    return { dialogs, selection };
}

/** One request carries at most `artifactBatchMaxItems`; a larger selection says so instead. */
function withinBatch(count: number): boolean {
    if (count <= artifactBatchMaxItems) {
        return true;
    }
    toast.danger(`Select at most ${artifactBatchMaxItems.toLocaleString('en-US')} items at once`, {
        description: `${count.toLocaleString('en-US')} are selected.`,
    });
    return false;
}

function moveItem(item: LibraryItem): ArtifactMoveItem {
    return item.kind === 'file'
        ? { kind: 'file', path: item.path, revisionId: item.file.revision_id }
        : { kind: 'folder', path: item.path };
}
