import { Label } from '@heroui/react';
import { ChatAttachment, ContextMenu } from '@heroui-pro/react';
import { Download04Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { ArtifactFileIcon } from '../../artifacts/icons/artifact-file-icon.tsx';
import {
    mediaStripMarkSize,
    mediaStripTileAttribute,
    mediaStripTileClassName,
    mediaStripTriggerClassName,
} from '../../chats/message-media-strip.tsx';
import { describeAttachment, type MessageAttachmentItem } from './attachment-view.ts';

/**
 * One file in a message's media strip: a stock Pro file card in the strip's
 * box, with the Artifacts file icon, the name, and "PDF · 2.4 MB". With
 * `onDownload` the whole tile saves the file and the context menu offers the
 * same; without it (a pending send, whose bytes are still uploading) the tile
 * is a plain, inert label.
 */
export function AttachmentFileTile({
    attachment,
    downloadDisabled = false,
    onDownload,
}: {
    attachment: MessageAttachmentItem;
    downloadDisabled?: boolean;
    onDownload?: () => void;
}) {
    const card = (
        <ChatAttachment
            className={
                onDownload ? mediaStripTileClassName : `${mediaStripTileClassName} snap-start`
            }
            // Always the file card, whatever the type: a video or image that
            // reaches here has no drawable preview.
            mediaType="document"
            mimeType={attachment.mediaType}
            name={attachment.filename}
            size={attachment.sizeBytes}
            title={attachment.filename}
        >
            <ChatAttachment.Preview>
                <ArtifactFileIcon kind={attachment.kind} size={mediaStripMarkSize} />
            </ChatAttachment.Preview>
            <ChatAttachment.Info>
                <ChatAttachment.Name />
                <ChatAttachment.Size>{describeAttachment(attachment)}</ChatAttachment.Size>
            </ChatAttachment.Info>
        </ChatAttachment>
    );

    if (!onDownload) {
        return card;
    }

    return (
        <ContextMenu>
            <ContextMenu.Trigger className="shrink-0 snap-start">
                <button
                    aria-label={`Download ${attachment.filename}`}
                    className={`${mediaStripTriggerClassName} cursor-pointer disabled:cursor-default`}
                    disabled={downloadDisabled}
                    onClick={onDownload}
                    type="button"
                    {...{ [mediaStripTileAttribute]: '' }}
                >
                    {card}
                </button>
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onDownload}>
                    <ContextMenu.Item
                        id="download"
                        isDisabled={downloadDisabled}
                        textValue="Download"
                    >
                        <Icon className="size-4 text-muted" icon={Download04Icon} />
                        <Label>Download</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
