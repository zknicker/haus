import type { ArtifactMetadata } from '@haus/api';
import { useArtifactThumbnailUrls } from '../../hooks/artifacts/use-artifact-thumbnails.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import type { ArtifactFolderPreview } from './icons/artifact-folder-icon.tsx';
import { useDecodedImages } from './use-decoded-image.ts';

export function useFolderPeeks(previews: readonly ArtifactMetadata[], serverId: string) {
    const photos = previews.filter(hasLibraryPreview);
    const urls = useArtifactThumbnailUrls(
        serverId,
        photos.map((artifact) => ({
            artifactId: artifact.artifact_id,
            revisionId: artifact.revision_id,
        }))
    );
    const decoded = useDecodedImages(
        photos.map((artifact, index) => ({ id: artifact.artifact_id, url: urls[index] }))
    );
    const peeks: ArtifactFolderPreview[] = previews.map((artifact) => ({
        imageUrl: hasLibraryPreview(artifact) ? decoded.get(artifact.artifact_id) : undefined,
        kind: artifactFileKind(artifact),
    }));
    return peeks;
}

export function folderCountLabel(count: number) {
    if (count === 0) {
        return 'Empty';
    }
    return count === 1 ? '1 file' : `${count} files`;
}
