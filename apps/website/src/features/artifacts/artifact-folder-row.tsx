import type { ArtifactFolderEntry, ArtifactMetadata } from '@haus/api';
import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { useState } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { useArtifactThumbnailUrls } from '../../hooks/artifacts/use-artifact-thumbnails.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { ArtifactRenameDialog, type ArtifactRenameTarget } from './artifact-rename-dialog.tsx';
import { artifactFolderToneMap } from './drive-folders.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { ArtifactFolderIcon, type ArtifactFolderTone } from './icons/artifact-folder-icon.tsx';
import { useDecodedImages } from './use-decoded-image.ts';

/**
 * The open folder's child folders, Finder's icon view: each tile peeks a few
 * of its newest files and counts what is inside under the current filters.
 * Pressing a tile opens the folder; right-clicking it offers Rename folder.
 */
export function ArtifactFolderRow({
    folders,
    onOpen,
    previews,
    serverId,
}: {
    folders: readonly ArtifactFolderEntry[];
    onOpen: (path: string) => void;
    previews: ReadonlyMap<string, ArtifactMetadata[]>;
    serverId: string;
}) {
    const [renaming, setRenaming] = useState<ArtifactRenameTarget | null>(null);
    const tones = artifactFolderToneMap(folders.map((folder) => folder.path));
    return (
        <>
            <ListBox
                aria-label="Folders"
                className="artifact-folder-row"
                items={folders.map((folder) => ({ ...folder, id: folder.path }))}
                onAction={(key) => onOpen(String(key))}
                orientation="horizontal"
            >
                {(folder) => (
                    <ListBoxItem
                        className="artifact-tile artifact-tile--folder artifact-folder-trigger"
                        id={folder.path}
                        textValue={folder.name}
                    >
                        <ContextMenu>
                            <ContextMenu.Trigger className="artifact-tile__body">
                                <ArtifactFolderTile
                                    folder={folder}
                                    previews={previews.get(folder.path) ?? []}
                                    serverId={serverId}
                                    tone={tones.get(folder.path) ?? 'blue'}
                                />
                            </ContextMenu.Trigger>
                            <ContextMenu.Popover>
                                <ContextMenu.Menu
                                    onAction={(key) =>
                                        key === 'open'
                                            ? onOpen(folder.path)
                                            : setRenaming({ kind: 'folder', path: folder.path })
                                    }
                                >
                                    <ContextMenu.Item id="open" textValue="Open">
                                        <Label>Open</Label>
                                    </ContextMenu.Item>
                                    <ContextMenu.Item id="rename" textValue="Rename folder">
                                        <Label>Rename folder</Label>
                                    </ContextMenu.Item>
                                </ContextMenu.Menu>
                            </ContextMenu.Popover>
                        </ContextMenu>
                    </ListBoxItem>
                )}
            </ListBox>
            <ArtifactRenameDialog
                onClose={() => setRenaming(null)}
                serverId={serverId}
                target={renaming}
            />
        </>
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
