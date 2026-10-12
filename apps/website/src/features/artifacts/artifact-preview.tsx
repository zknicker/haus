import type { ArtifactMetadata } from '@haus/api';
import { Button } from '@heroui/react';
import { useState } from 'react';
import { ImageLightbox } from '../../components/chats/image-lightbox.tsx';
import { useArtifactDownload } from '../../hooks/artifacts/use-artifact-download.ts';
import { useArtifactSave } from '../../hooks/artifacts/use-artifact-save.ts';
import { artifactKindLabel, formatArtifactBytes, isPreviewImage } from './artifact-format.ts';
import { ArtifactFileIcon } from './icons/artifact-file-icon.tsx';
import { artifactFileKind } from './icons/artifact-file-kind.ts';

const playableVideo = ['video/mp4', 'video/webm'];
const playableAudio = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'];

/**
 * The file itself, in a quiet well: raster images (press to zoom), native
 * video and audio players, and for everything else the file's sheet with a
 * way to download it. Only previewable kinds fetch a signed link up front.
 */
export function ArtifactPreview({
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
        return (
            <section aria-label="File preview" className="artifact-preview artifact-preview--file">
                <ArtifactFileCard artifact={artifact} serverId={serverId} />
            </section>
        );
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

/** A file the App does not render: its sheet, its facts, and the way to download it. */
function ArtifactFileCard({
    artifact,
    serverId,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
}) {
    const { saveFile, saving } = useArtifactSave(serverId);
    const kind = artifactFileKind(artifact);
    return (
        <div className="flex flex-col items-center gap-4 text-center">
            <ArtifactFileIcon kind={kind} size={96} />
            <div className="flex flex-col gap-1">
                <p className="break-all font-medium text-foreground text-sm">{artifact.filename}</p>
                <p className="text-muted text-sm">
                    {artifactKindLabel(kind)} · {formatArtifactBytes(artifact.size_bytes)}
                </p>
            </div>
            <Button
                isPending={saving}
                onPress={() =>
                    saveFile({ artifactId: artifact.artifact_id, revisionId: artifact.revision_id })
                }
                size="sm"
                variant="secondary"
            >
                Download
            </Button>
        </div>
    );
}
