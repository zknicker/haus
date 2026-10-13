import type { ArtifactMetadata } from '@haus/api';
import { useState } from 'react';
import { ImageLightbox } from '../../components/chats/image-lightbox.tsx';
import { useArtifactDownload } from '../../hooks/artifacts/use-artifact-download.ts';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { ArtifactFileCard } from './artifact-file-card.tsx';
import { isPreviewImage } from './artifact-format.ts';
import { artifactTextRenderer } from './artifact-text.ts';
import { ArtifactTextPreview } from './artifact-text-preview.tsx';

const playableVideo = ['video/mp4', 'video/webm'];
const playableAudio = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'];

/**
 * The file itself: text files as the Artifact Panel draws them, raster images
 * (press to zoom), native video and audio players, and for everything else
 * the file's sheet with a way to download it.
 */
export function ArtifactPreview({
    artifact,
    serverId,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
}) {
    const renderer = artifactTextRenderer(artifact);
    if (renderer) {
        return <ArtifactTextPreview artifact={artifact} renderer={renderer} serverId={serverId} />;
    }
    return <ArtifactMediaPreview artifact={artifact} serverId={serverId} />;
}

/** Only previewable media fetch a signed link up front. */
function ArtifactMediaPreview({
    artifact,
    serverId,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
}) {
    const type = artifact.content_type;
    const previewable =
        isPreviewImage(type) || playableVideo.includes(type) || playableAudio.includes(type);
    const download = useArtifactDownload(serverId, artifact.artifact_id, artifact.revision_id, {
        enabled: previewable,
    });
    const [failed, setFailed] = useState(false);
    const url = download.data?.download_url;

    if (!previewable || failed || download.error) {
        return <ArtifactFileCard artifact={artifact} serverId={serverId} />;
    }
    return (
        <section aria-label="File preview" className="artifact-preview">
            {url === undefined ? null : isPreviewImage(type) ? (
                <ArtifactImage
                    artifact={artifact}
                    onError={() => setFailed(true)}
                    serverId={serverId}
                    url={url}
                />
            ) : playableVideo.includes(type) ? (
                <video aria-label={artifact.title} controls preload="metadata" src={url}>
                    <track kind="captions" />
                </video>
            ) : (
                <audio aria-label={artifact.title} controls preload="metadata" src={url}>
                    <track kind="captions" />
                </audio>
            )}
        </section>
    );
}

function ArtifactImage({
    artifact,
    onError,
    serverId,
    url,
}: {
    artifact: ArtifactMetadata;
    onError: () => void;
    serverId: string;
    url: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const { saveFile, saving } = useArtifactSave(serverId);
    return (
        <>
            <button
                aria-label={`Expand ${artifact.title}`}
                className="artifact-preview__image"
                onClick={() => setExpanded(true)}
                type="button"
            >
                {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load failures are not user interaction. */}
                <img alt={artifact.title} height={600} onError={onError} src={url} width={800} />
            </button>
            <ImageLightbox
                dataUrl={url}
                download={{
                    disabled: saving,
                    kind: 'action',
                    onDownload: () =>
                        void saveFile({
                            artifactId: artifact.artifact_id,
                            revisionId: artifact.revision_id,
                        }),
                }}
                filename={artifact.filename}
                onOpenChange={setExpanded}
                open={expanded}
            />
        </>
    );
}
