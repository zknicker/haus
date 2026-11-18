import type { ArtifactFolderEntry, ArtifactMetadata } from '@haus/api';
import { Tooltip } from '@heroui/react';
import { GridListItem, GridListSection } from 'react-aria-components';
import { useArtifactThumbnailUrls } from '../../hooks/artifacts/use-artifact-thumbnails.ts';
import { useArtifactActionsContext } from './artifact-actions-context.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { ArtifactInlineRename } from './artifact-inline-rename.tsx';
import { artifactFolderTone, artifactFolderWithin, middleTruncatedName } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import { useOpenInTabPress } from './library-selection.ts';
import { useDecodedImages } from './use-decoded-image.ts';

/**
 * The open folder's child folders (or a search's matching folders) as the
 * first section of the library's collection, Finder's icon view: each tile
 * peeks a few of its newest files and counts what is inside under the current
 * filters. Tiles select, open, and take dropped items like every other item;
 * the tile under a drag of library items lights up (`dropTarget`), and a tile
 * being renamed shows its name as a field.
 */
export function ArtifactFolderSection({
    dropTarget,
    folder,
    folders,
    onOpen,
    previews,
    serverId,
}: {
    /** The folder tile a drag of library items is over, if any. */
    dropTarget: string | null;
    /** The open folder, so a search hit deeper down names where it sits. */
    folder: string;
    folders: readonly ArtifactFolderEntry[];
    onOpen: (path: string) => void;
    previews: ReadonlyMap<string, ArtifactMetadata[]>;
    serverId: string;
}) {
    const openInTabPress = useOpenInTabPress();
    return (
        <GridListSection aria-label="Folders" className="artifact-folder-row" id="folders">
            {folders.map((entry) => (
                <GridListItem
                    className="artifact-tile artifact-tile--folder artifact-folder-trigger"
                    data-move-target={dropTarget === entry.path || undefined}
                    id={entry.path}
                    key={entry.path}
                    onPress={openInTabPress(() => onOpen(entry.path))}
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
