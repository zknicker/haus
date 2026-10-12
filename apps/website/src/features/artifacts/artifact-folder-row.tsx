import type { ArtifactCreator } from '@haus/api';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useArtifactCreators } from '../../hooks/artifacts/use-artifact-creators.ts';
import { useArtifactDownloadUrls } from '../../hooks/artifacts/use-artifact-download-urls.ts';
import {
    type ArtifactFolder,
    allFolderKey,
    artifactFolders,
    creatorKey,
} from './artifact-creators.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { ArtifactFolderIcon } from './icons/artifact-folder-icon.tsx';
import { useArtifactCreatorDirectory } from './use-artifact-creator-directory.ts';
import { useDecodedImages } from './use-decoded-image.ts';

/**
 * The library's folders: All, then one per creator. Storage is flat; a folder
 * is a creator filter, chosen like a Finder sidebar item. Hidden until the
 * creators read lands, and when nobody has published anything yet.
 */
export function ArtifactFolderRow({
    onSelect,
    selected,
    serverId,
}: {
    onSelect: (creator: ArtifactCreator | null) => void;
    selected: ArtifactCreator | null;
    serverId: string;
}) {
    const creators = useArtifactCreators(serverId);
    const directory = useArtifactCreatorDirectory(serverId);
    const summaries = creators.data?.creators;
    if (!summaries || summaries.length === 0) {
        return null;
    }
    const folders = artifactFolders(summaries, directory);
    const selectedKey = selected ? creatorKey(selected) : allFolderKey;
    return (
        <ListBox
            aria-label="Folders"
            className="artifact-folder-row"
            disallowEmptySelection
            items={folders}
            onSelectionChange={(keys) => {
                const [key] = keys === 'all' ? [] : [...keys];
                onSelect(folders.find((folder) => folder.key === key)?.creator ?? null);
            }}
            orientation="horizontal"
            selectedKeys={[selectedKey]}
            selectionMode="single"
        >
            {(folder) => (
                <ListBoxItem
                    className="artifact-tile artifact-tile--folder artifact-folder-trigger"
                    data-open={folder.key === selectedKey || undefined}
                    id={folder.key}
                    textValue={folder.label}
                >
                    <ArtifactFolderTile
                        avatar={folder.creator ? directory.avatar(folder.creator) : null}
                        folder={folder}
                        serverId={serverId}
                    />
                </ListBoxItem>
            )}
        </ListBox>
    );
}

function ArtifactFolderTile({
    avatar,
    folder,
    serverId,
}: {
    avatar: { name: string; src: string | null } | null;
    folder: ArtifactFolder;
    serverId: string;
}) {
    const photos = folder.previews.filter(hasLibraryPreview);
    const urls = useArtifactDownloadUrls(
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
    const previews = folder.previews.map((artifact) => ({
        imageUrl: hasLibraryPreview(artifact) ? decoded.get(artifact.artifact_id) : undefined,
        kind: artifactFileKind(artifact),
    }));
    return (
        <>
            <span className="artifact-tile__well">
                <ArtifactFolderIcon previews={previews} size={56} tone={folder.tone} />
            </span>
            <span className="artifact-tile__title">
                {avatar ? <EntityAvatar name={avatar.name} size={16} src={avatar.src} /> : null}
                <span className="truncate">{folder.label}</span>
            </span>
            <span className="artifact-tile__meta">
                {folder.count === 1 ? '1 file' : `${folder.count} files`}
            </span>
        </>
    );
}
