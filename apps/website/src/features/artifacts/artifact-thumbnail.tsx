import type { ArtifactMetadata } from '@haus/api';
import { identityMarkRadius } from '../../components/ui/entity-avatar.tsx';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';
import { useArtifactPhoto } from './use-artifact-photo.ts';

type ThumbnailArtifact = Pick<
    ArtifactMetadata,
    'artifact_id' | 'content_type' | 'filename' | 'revision_id'
>;

/**
 * A file at a fixed size: a rounded photo for raster images once its thumbnail
 * decodes, else (and until then) its kind's sheet. The photo's corner
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
 * A file filling a grid tile's well: the thumbnail cropped to the well for
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
