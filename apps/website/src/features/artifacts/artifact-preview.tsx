import type { ArtifactRecord } from '@haus/api';
import { useState } from 'react';
import { ImageLightbox } from '../../components/chats/image-lightbox.tsx';
import { useArtifactDownload } from '../../hooks/artifacts/use-artifact-download.ts';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { ArtifactFileCard } from './artifact-file-card.tsx';
import { isPreviewImage } from './artifact-format.ts';
import { artifactTextRenderer } from './artifact-text.ts';
import { ArtifactTextPreview } from './artifact-text-preview.tsx';
import type { ViewerStepper } from './artifact-viewer-header.tsx';

const playableVideo = ['video/mp4', 'video/webm'];
const playableAudio = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'];

/**
 * The file itself: text files as the Artifact Panel draws them, raster images
 * (press to zoom; never enlarged past their own pixels), native video and
 * audio players, and for everything else the file's sheet with a way to
 * download it. The zoom viewer steps through the folder like the viewer.
 */
export function ArtifactPreview({
    artifact,
    serverId,
    startZoomed = false,
    stepper = null,
}: {
    artifact: ArtifactRecord;
    serverId: string;
    /** Reached by stepping inside the zoom viewer: open zoomed again. */
    startZoomed?: boolean;
    stepper?: ViewerStepper | null;
}) {
    const renderer = artifactTextRenderer(artifact);
    if (renderer) {
        return <ArtifactTextPreview artifact={artifact} renderer={renderer} serverId={serverId} />;
    }
    return (
        <ArtifactMediaPreview
            artifact={artifact}
            serverId={serverId}
            startZoomed={startZoomed}
            stepper={stepper}
        />
    );
}

/** Only previewable media fetch a signed link up front. */
function ArtifactMediaPreview({
    artifact,
    serverId,
    startZoomed,
    stepper,
}: {
    artifact: ArtifactRecord;
    serverId: string;
    startZoomed: boolean;
    stepper: ViewerStepper | null;
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
                    startZoomed={startZoomed}
                    stepper={stepper}
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
    startZoomed,
    stepper,
    url,
}: {
    artifact: ArtifactRecord;
    onError: () => void;
    serverId: string;
    startZoomed: boolean;
    stepper: ViewerStepper | null;
    url: string;
}) {
    const [expanded, setExpanded] = useState(startZoomed);
    const { saveFile, saving } = useArtifactSave(serverId);
    return (
        <>
            <button
                aria-label={`Expand ${artifact.title}`}
                className="artifact-preview__image"
                onClick={() => setExpanded(true)}
                type="button"
            >
                {/* Sized by its own pixels (once measured), so CSS can only shrink it. */}
                {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load failures are not user interaction. */}
                <img
                    alt={artifact.title}
                    height={artifact.image?.height}
                    onError={onError}
                    src={url}
                    width={artifact.image?.width}
                />
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
                height={artifact.image?.height}
                navigation={stepper ?? undefined}
                onOpenChange={setExpanded}
                open={expanded}
                width={artifact.image?.width}
            />
        </>
    );
}
