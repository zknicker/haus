import type { ArtifactMetadata } from '@haus/api';
import { Button, Modal } from '@heroui/react';
import { useState } from 'react';
import { useArtifactFile } from '../../hooks/artifacts/use-artifact-file.ts';
import { isPreviewImage } from './artifact-format.ts';
import { ArtifactFileIcon } from './artifact-thumbnail.tsx';

export function ArtifactPreview({
    artifact,
    serverId,
}: {
    artifact: ArtifactMetadata;
    serverId: string;
}) {
    const { download, opening, openError, openFile } = useArtifactFile(
        serverId,
        artifact.artifact_id,
        artifact.revision_id
    );
    const [expanded, setExpanded] = useState(false);
    if (download.error) {
        return <p role="alert">{download.error.message}</p>;
    }
    if (!download.data) {
        return <section aria-label="Loading preview" className="min-h-32" />;
    }
    const url = download.data.download_url;
    return (
        <section aria-label="File preview" className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <span className="truncate text-muted text-sm">{artifact.filename}</span>
                <div className="flex shrink-0 gap-2">
                    {isPreviewImage(artifact.content_type) ? (
                        <Button onPress={() => setExpanded(true)} size="sm" variant="ghost">
                            Expand
                        </Button>
                    ) : null}
                    <Button isPending={opening} onPress={openFile} size="sm" variant="secondary">
                        Open file
                    </Button>
                </div>
            </div>
            {openError ? <p role="alert">{openError}</p> : null}
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-secondary p-4">
                <ArtifactMedia artifact={artifact} url={url} />
            </div>
            <Modal.Backdrop isOpen={expanded} onOpenChange={setExpanded}>
                <Modal.Container size="full">
                    <Modal.Dialog>
                        <Modal.CloseTrigger />
                        <Modal.Header>
                            <Modal.Heading>{artifact.title}</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                            <ImagePreview title={artifact.title} url={url} />
                        </Modal.Body>
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </section>
    );
}
function ArtifactMedia({ artifact, url }: { artifact: ArtifactMetadata; url: string }) {
    const [failed, setFailed] = useState(false);
    if (isPreviewImage(artifact.content_type) && !failed) {
        return (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load failures are not user interaction.
            <img
                alt={artifact.title}
                className="h-full w-full object-contain"
                height={600}
                onError={() => setFailed(true)}
                src={url}
                width={800}
            />
        );
    }
    if (['video/mp4', 'video/webm'].includes(artifact.content_type)) {
        return (
            <video
                aria-label={artifact.title}
                className="max-h-full max-w-full"
                controls
                preload="metadata"
                src={url}
            >
                <track kind="captions" />
                Your browser cannot preview this video.
            </video>
        );
    }
    if (
        ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'].includes(
            artifact.content_type
        )
    ) {
        return (
            <audio aria-label={artifact.title} controls preload="metadata" src={url}>
                <track kind="captions" />
                Your browser cannot preview this audio.
            </audio>
        );
    }
    return (
        <div className="flex flex-col items-center gap-4">
            <div className="h-24 w-24">
                <ArtifactFileIcon type={artifact.content_type} />
            </div>
            <p className="text-muted text-sm">
                {failed
                    ? 'Image preview could not be loaded.'
                    : 'Open this file to view or download it.'}
            </p>
        </div>
    );
}
function ImagePreview({ title, url }: { title: string; url: string }) {
    const [zoom, setZoom] = useState(1);
    return (
        <div className="flex h-[75vh] flex-col gap-3">
            <div className="flex items-center justify-center gap-2">
                <Button
                    isDisabled={zoom <= 1}
                    onPress={() => setZoom(Math.max(1, zoom - 0.5))}
                    variant="ghost"
                >
                    Zoom out
                </Button>
                <Button onPress={() => setZoom(1)} variant="ghost">
                    Fit
                </Button>
                <Button
                    isDisabled={zoom >= 4}
                    onPress={() => setZoom(Math.min(4, zoom + 0.5))}
                    variant="ghost"
                >
                    Zoom in
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                <div
                    className="flex min-h-full min-w-full items-center justify-center"
                    style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
                >
                    <img
                        alt={title}
                        className="h-full w-full object-contain"
                        height={600}
                        src={url}
                        width={800}
                    />
                </div>
            </div>
        </div>
    );
}
