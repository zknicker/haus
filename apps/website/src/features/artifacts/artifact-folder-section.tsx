import type { ArtifactMetadata } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { GridListItem, GridListSection } from 'react-aria-components';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { ArtifactFolderRow } from './artifact-folder-row.tsx';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { artifactFolderTone, artifactFolderWithin, middleTruncatedName } from './drive-folders.ts';
import type { DriveFolder } from './drive-places.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import type { ArtifactLibraryLayout } from './library-layout.ts';
import { useLibraryItemPress } from './library-selection.ts';
import { folderCountLabel, useFolderPeeks } from './use-folder-peeks.ts';

/**
 * The open folder's child folders (or a search's matching folders) as the
 * first section of the library's collection: Finder's icon view in the grid,
 * where each tile peeks a few of its newest files and counts what is inside
 * under the current filters, and rows under the file columns in the list.
 * Folders select, open, and take dropped items like every other item; the one
 * under a drag of library items lights up (`dropTarget`), and one being
 * renamed shows its name as a field.
 */
export function ArtifactFolderSection({
    dropTarget,
    folder,
    folders,
    layout,
    onOpen,
    previews,
    serverId,
}: {
    /** The folder tile a drag of library items is over, if any. */
    dropTarget: string | null;
    /** The open folder, so a search hit deeper down names where it sits. */
    folder: string;
    folders: readonly DriveFolder[];
    layout: ArtifactLibraryLayout;
    onOpen: (path: string) => void;
    previews: ReadonlyMap<string, ArtifactMetadata[]>;
    serverId: string;
}) {
    const openOnPress = useLibraryItemPress();
    if (layout === 'list') {
        return (
            <GridListSection aria-label="Folders" className="artifact-file-run" id="folders">
                {folders.map((entry) => (
                    <ArtifactFolderRow
                        dropTarget={dropTarget === entry.path}
                        folder={entry}
                        key={entry.path}
                        onOpen={() => onOpen(entry.path)}
                        previews={previews.get(entry.path) ?? []}
                        serverId={serverId}
                        within={artifactFolderWithin(entry.path, folder)}
                    />
                ))}
            </GridListSection>
        );
    }
    return (
        <GridListSection aria-label="Folders" className="artifact-folder-row" id="folders">
            {folders.map((entry) => (
                <GridListItem
                    className="artifact-tile artifact-tile--folder artifact-folder-trigger"
                    data-move-target={dropTarget === entry.path || undefined}
                    id={entry.path}
                    key={entry.path}
                    onPress={openOnPress(() => onOpen(entry.path))}
                    textValue={entry.name}
                >
                    <ArtifactFolderTile
                        folder={entry}
                        previews={previews.get(entry.path) ?? []}
                        serverId={serverId}
                        within={artifactFolderWithin(entry.path, folder)}
                    />
                </GridListItem>
            ))}
        </GridListSection>
    );
}

function ArtifactFolderTile({
    folder,
    previews,
    serverId,
    within,
}: {
    folder: DriveFolder;
    previews: readonly ArtifactMetadata[];
    serverId: string;
    /** Where a search hit sits relative to the open folder; `''` when directly in it. */
    within: string;
}) {
    const actions = useArtifactActionsContext();
    const peeks = useFolderPeeks(previews, serverId);
    const count = folderCountLabel(folder.file_count);
    const renaming = actions.renaming?.kind === 'folder' && actions.renaming.path === folder.path;
    return (
        <>
            <span className="artifact-tile__well">
                <ArtifactFolderIcon
                    previews={peeks}
                    size={56}
                    tone={artifactFolderTone(folder.path)}
                />
            </span>
            {renaming && actions.renaming ? (
                <ArtifactInlineRename
                    onDone={actions.endRename}
                    serverId={serverId}
                    target={actions.renaming}
                />
            ) : (
                // Long print names share a prefix: two lines, a middle cut that keeps the tail, and
                // the full path on hover tell them apart.
                <Tooltip closeDelay={0} delay={600}>
                    <Tooltip.Trigger role="presentation" tabIndex={-1}>
                        <span className="artifact-tile__title artifact-tile__title--wrap">
                            {middleTruncatedName(folder.name)}
                        </span>
                    </Tooltip.Trigger>
                    <Tooltip.Content>{folder.path}</Tooltip.Content>
                </Tooltip>
            )}
            <span className="artifact-tile__meta">{within ? `${within} · ${count}` : count}</span>
        </>
    );
}
