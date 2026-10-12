import { Label } from '@heroui/react';
import { ChatAttachment, ContextMenu } from '@heroui-pro/react';
import { Download04Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAttachmentImage } from '../../../hooks/servers/use-attachment-image.ts';
import {
    mediaStripPlaceholderClassName,
    mediaStripTileAttribute,
    mediaStripTileClassName,
    mediaStripTriggerClassName,
} from '../../chats/message-media-strip.tsx';
import { AttachmentFileTile } from './attachment-file-tile.tsx';
import type { MessageAttachmentItem } from './attachment-view.ts';

/**
 * One image in a message's media strip, drawn from the decoded-image cache
 * and cropped to the strip's box, so the row never changes size when the
 * bytes land. Bytes the browser cannot draw become a file tile, never a
 * broken image.
 */
export function AttachmentImageTile({
    attachment,
    downloadDisabled,
    onDownload,
    onOpen,
}: {
    attachment: MessageAttachmentItem;
    downloadDisabled: boolean;
    onDownload?: () => void;
    onOpen: () => void;
}) {
    const loaded = useAttachmentImage(attachment.source);
    const [paintFailed, setPaintFailed] = React.useState(false);

    if (loaded.failed || paintFailed) {
        return (
            <AttachmentFileTile
                attachment={attachment}
                downloadDisabled={downloadDisabled}
                onDownload={onDownload}
            />
        );
    }

    const { image } = loaded;
    if (!image) {
        return <div aria-hidden="true" className={mediaStripPlaceholderClassName} />;
    }

    return (
        <ContextMenu isDisabled={!onDownload}>
            <ContextMenu.Trigger className="shrink-0 snap-start">
                <button
                    aria-label={`Open ${attachment.filename}`}
                    className={`${mediaStripTriggerClassName} cursor-zoom-in`}
                    onClick={onOpen}
                    type="button"
                    {...{ [mediaStripTileAttribute]: '' }}
                >
                    <ChatAttachment
                        className={mediaStripTileClassName}
                        mediaType="image"
                        mimeType={attachment.mediaType}
                        name={attachment.filename}
                        size={attachment.sizeBytes}
                        src={image.url}
                    >
                        <ChatAttachment.Preview>
                            {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a load failure, not a user interaction; it swaps in the file tile. */}
                            <img
                                alt=""
                                className="chat-attachment__preview-image"
                                height={image.height}
                                onError={() => setPaintFailed(true)}
                                src={image.url}
                                width={image.width}
                            />
                        </ChatAttachment.Preview>
                        <ChatAttachment.Info>
                            <ChatAttachment.Name />
                        </ChatAttachment.Info>
                    </ChatAttachment>
                </button>
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onDownload}>
                    <ContextMenu.Item
                        id="save-image-as"
                        isDisabled={downloadDisabled}
                        textValue="Save Image As"
                    >
                        <Icon className="size-4 text-muted" icon={Download04Icon} />
                        <Label>Save Image As…</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
