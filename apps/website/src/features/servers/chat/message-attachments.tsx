import * as React from 'react';
import { MessageMediaStrip } from '../../chats/message-media-strip.tsx';
import type { SharedArtifactLinkTarget } from '../../chats/shared-artifact-link.ts';
import { sharedArtifactKey } from '../../chats/shared-artifact-link.ts';
import type { SharedArtifactScope } from '../../chats/shared-artifact-scope.tsx';
import { SharedArtifactTile } from '../../chats/shared-artifact-tile.tsx';
import { AttachmentFileTile } from './attachment-file-tile.tsx';
import { AttachmentImageTile } from './attachment-image-tile.tsx';
import { AttachmentLightbox } from './attachment-lightbox.tsx';
import type { MessageAttachmentItem } from './attachment-view.ts';

/** The library artifacts a message links to, with the scope that resolved them. */
export interface MessageSharedArtifacts {
    scope: SharedArtifactScope;
    targets: readonly SharedArtifactLinkTarget[];
}

/**
 * Everything a message carries, below its text, as one media strip: its
 * images, then its other files, then the library artifacts it links to, each
 * group in message order. Durable and pending rows both render this, so a
 * send keeps its shape when the Server confirms it. Without `onDownload` (a
 * pending send) nothing offers to save bytes still uploading.
 */
export function MessageAttachments({
    attachments,
    downloadDisabled = false,
    onDownload,
    sharedArtifacts,
}: {
    attachments: readonly MessageAttachmentItem[];
    downloadDisabled?: boolean;
    onDownload?: (attachment: MessageAttachmentItem) => void;
    sharedArtifacts?: MessageSharedArtifacts | null;
}) {
    const [viewing, setViewing] = React.useState<number | null>(null);
    const images = attachments.filter((attachment) => attachment.kind === 'image');
    const files = attachments.filter((attachment) => attachment.kind !== 'image');
    const [firstImage, ...restImages] = images;

    return (
        <>
            <MessageMediaStrip>
                {images.map((attachment, index) => (
                    <AttachmentImageTile
                        attachment={attachment}
                        downloadDisabled={downloadDisabled}
                        key={attachment.id}
                        onDownload={onDownload ? () => onDownload(attachment) : undefined}
                        onOpen={() => setViewing(index)}
                    />
                ))}
                {files.map((attachment) => (
                    <AttachmentFileTile
                        attachment={attachment}
                        downloadDisabled={downloadDisabled}
                        key={attachment.id}
                        onDownload={onDownload ? () => onDownload(attachment) : undefined}
                    />
                ))}
                {sharedArtifacts?.targets.map((target) => (
                    <SharedArtifactTile
                        key={sharedArtifactKey(target)}
                        scope={sharedArtifacts.scope}
                        target={target}
                    />
                ))}
            </MessageMediaStrip>
            {firstImage && viewing !== null ? (
                <AttachmentLightbox
                    downloadDisabled={downloadDisabled}
                    images={[firstImage, ...restImages]}
                    index={viewing}
                    onClose={() => setViewing(null)}
                    onDownload={onDownload}
                    onIndexChange={setViewing}
                />
            ) : null}
        </>
    );
}
