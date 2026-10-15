import type { ArtifactFolderEntry, ArtifactMetadata } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { useArtifactThumbnailUrls } from '../../hooks/artifacts/use-artifact-thumbnails.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { artifactFolderTone, artifactFolderWithin, middleTruncatedName } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import {
    type LibrarySelection,
    librarySelectionProps,
    useOpenInTabPress,
} from './library-selection.ts';
import { useDecodedImages } from './use-decoded-image.ts';

/**
 * The open folder's child folders (or a search's matching folders), Finder's
 * icon view: each tile peeks a few of its newest files and counts what is
 * inside under the current filters. A click selects a tile and a double click
 * or Return opens it (a touch tap opens at once); right-clicking it opens the
 * library's folder menu, and a tile being renamed shows its name as a field.
 */
export function ArtifactFolderRow({
    folder,
    folders,
    onOpen,
    previews,
    selection,
    serverId,
}: {
    /** The open folder, so a search hit deeper down names where it sits. */
    folder: string;
    folders: readonly ArtifactFolderEntry[];
    onOpen: (path: string) => void;
    previews: ReadonlyMap<string, ArtifactMetadata[]>;
    selection: LibrarySelection;
    serverId: string;
}) {
    const openInTabPress = useOpenInTabPress();
    return (
        <ListBox
            aria-label="Folders"
            className="artifact-folder-row"
            items={folders.map((entry) => ({ ...entry, id: entry.path }))}
            onAction={(key) => onOpen(String(key))}
            orientation="horizontal"
            {...librarySelectionProps(
                selection,
                folders.map((entry) => entry.path)
            )}
        >
            {(entry) => (
                <ListBoxItem
                    className="artifact-tile artifact-tile--folder artifact-folder-trigger"
                    id={entry.path}
                    onPress={openInTabPress(() => onOpen(entry.path))}
                    textValue={entry.name}
                >
                    <ArtifactFolderTile
                        folder={entry}
                        previews={previews.get(entry.path) ?? []}
                        serverId={serverId}
                        within={artifactFolderWithin(entry.path, folder)}
                    />
                </ListBoxItem>
            )}
        </ListBox>
    );
}

function ArtifactFolderTile({
    folder,
    previews,
    serverId,
    within,
}: {
    folder: ArtifactFolderEntry;
    previews: readonly ArtifactMetadata[];
    serverId: string;
    /** Where a search hit sits relative to the open folder; `''` when directly in it. */
    within: string;
}) {
    const actions = useArtifactActionsContext();
    const photos = previews.filter(hasLibraryPreview);
    const urls = useArtifactThumbnailUrls(
        serverId,
        photos.map((artifact) => ({
            artifactId: artifact.artifact_id,
            revisionId: artifact.revision_id,
        }))
    );
    // A photo peeks out only once decoded; until then, or if its link fails, the kind's sheet does.
    const decoded = useDecodedImages(
        photos.map((artifact, index) => ({ id: artifact.artifact_id, url: urls[index] }))
    );
    const peeks = previews.map((artifact) => ({
        imageUrl: hasLibraryPreview(artifact) ? decoded.get(artifact.artifact_id) : undefined,
        kind: artifactFileKind(artifact),
    }));
    const count = folder.file_count === 1 ? '1 file' : `${folder.file_count} files`;
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
