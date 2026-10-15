import type { ArtifactFolderEntry, ArtifactMetadata } from '@haus/api';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { useArtifactThumbnailUrls } from '../../hooks/artifacts/use-artifact-thumbnails.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { artifactFolderToneMap } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { ArtifactFolderIcon, type ArtifactFolderTone } from './icons/artifact-folder-icon.tsx';
import {
    type LibrarySelection,
    librarySelectionProps,
    useOpenInTabPress,
} from './library-selection.ts';
import { useDecodedImages } from './use-decoded-image.ts';

/**
 * The open folder's child folders, Finder's icon view: each tile peeks a few
 * of its newest files and counts what is inside under the current filters.
 * A click selects a tile and a double click or Return opens it (a touch tap
 * opens at once); right-clicking it opens the library's folder menu.
 */
export function ArtifactFolderRow({
    folders,
    onOpen,
    previews,
    selection,
    serverId,
}: {
    folders: readonly ArtifactFolderEntry[];
    onOpen: (path: string) => void;
    previews: ReadonlyMap<string, ArtifactMetadata[]>;
    selection: LibrarySelection;
    serverId: string;
}) {
    const tones = artifactFolderToneMap(folders.map((folder) => folder.path));
    const openInTabPress = useOpenInTabPress();
    return (
        <ListBox
            aria-label="Folders"
            className="artifact-folder-row"
            items={folders.map((folder) => ({ ...folder, id: folder.path }))}
            onAction={(key) => onOpen(String(key))}
            orientation="horizontal"
            {...librarySelectionProps(
                selection,
                folders.map((folder) => folder.path)
            )}
        >
            {(folder) => (
                <ListBoxItem
                    className="artifact-tile artifact-tile--folder artifact-folder-trigger"
                    id={folder.path}
                    onPress={openInTabPress(() => onOpen(folder.path))}
                    textValue={folder.name}
                >
                    <ArtifactFolderTile
                        folder={folder}
                        previews={previews.get(folder.path) ?? []}
                        serverId={serverId}
                        tone={tones.get(folder.path) ?? 'blue'}
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
    tone,
}: {
    folder: ArtifactFolderEntry;
    previews: readonly ArtifactMetadata[];
    serverId: string;
    tone: ArtifactFolderTone;
}) {
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
    return (
        <>
            <span className="artifact-tile__well">
                <ArtifactFolderIcon previews={peeks} size={56} tone={tone} />
            </span>
            <span className="artifact-tile__title">
                <span className="truncate">{folder.name}</span>
            </span>
            <span className="artifact-tile__meta">
                {folder.file_count === 1 ? '1 file' : `${folder.file_count} files`}
            </span>
        </>
    );
}
