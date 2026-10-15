import type { ArtifactMetadata } from '@haus/api';
import { useArtifactThumbnailUrl } from '../../hooks/artifacts/use-artifact-thumbnails.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { useDecodedImage } from './use-decoded-image.ts';

/**
 * A raster file's decoded thumbnail link; null for files without one, while it renders or
 * loads, and when it is refused or broken, so callers show the kind icon instead of a blank box.
 */
export function useArtifactPhoto(
    artifact: Pick<ArtifactMetadata, 'artifact_id' | 'content_type' | 'revision_id'>,
    serverId: string
) {
    const previewable = hasLibraryPreview(artifact);
    const url = useArtifactThumbnailUrl(
        serverId,
        { artifactId: artifact.artifact_id, revisionId: artifact.revision_id },
        { enabled: previewable }
    );
    const src = useDecodedImage(previewable ? url : undefined);
    return previewable ? src : null;
}
