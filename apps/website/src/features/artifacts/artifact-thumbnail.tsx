import type { ArtifactMetadata } from '@haus/api';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { useArtifactDownload } from '../../hooks/artifacts/use-artifact-download.ts';
import { hasLibraryPreview } from './artifact-format.ts';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useDecodedImage } from './use-decoded-image.ts';

type ThumbnailArtifact = Pick<
    ArtifactMetadata,
    'artifact_id' | 'content_type' | 'filename' | 'revision_id' | 'size_bytes'
>;

/**
 * A file at a fixed size: a rounded photo for small raster images once its
 * pixels decode, else (and until then) its kind's sheet. The photo's corner
 * follows its box (`identityMarkRadius`).
 */
export function ArtifactThumbnail({
    artifact,
    serverId,
    size = 40,
}: {
    artifact: ThumbnailArtifact;
    serverId: string;
    size?: number;
}) {
    const src = useArtifactPhoto(artifact, serverId);
    if (!src) {
        return <ArtifactFileIcon kind={artifactFileKind(artifact)} size={size} />;
    }
    return (
        <span
            className="artifact-thumbnail shrink-0"
            style={{ borderRadius: identityMarkRadius(size), height: size, width: size }}
        >
            <img alt="" height={size} src={src} width={size} />
        </span>
    );
}

/**
 * A file filling a grid tile's well: the photo cropped to the well for small
 * raster images once it decodes, else (and until then) its kind's sheet
 * centered at `iconSize`.
 */
export function ArtifactCover({
    artifact,
    iconSize = 56,
    serverId,
}: {
    artifact: ThumbnailArtifact;
    iconSize?: number;
    serverId: string;
}) {
    const src = useArtifactPhoto(artifact, serverId);
    if (!src) {
        return <ArtifactFileIcon kind={artifactFileKind(artifact)} size={iconSize} />;
    }
    return <img alt="" className="artifact-cover" height={240} src={src} width={320} />;
}

/**
 * The photo's signed link once decoded; null for files without a photo, while
 * loading, and when the link is refused (storage off, revision gone) or broken.
 */
function useArtifactPhoto(artifact: ThumbnailArtifact, serverId: string) {
    const previewable = hasLibraryPreview(artifact);
    const download = useArtifactDownload(serverId, artifact.artifact_id, artifact.revision_id, {
        enabled: previewable,
    });
    const src = useDecodedImage(previewable ? download.data?.download_url : undefined);
    return previewable ? src : null;
}
