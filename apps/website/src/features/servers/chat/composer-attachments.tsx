import { ChatAttachment, ChatAttachmentGroup, PromptInput } from '@heroui-pro/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useAttachmentImage } from '../../../hooks/servers/use-attachment-image.ts';
import { springs } from '../../../lib/springs.ts';
import { ArtifactFileIcon } from '../../artifacts/icons/artifact-file-icon.tsx';
import { describeAttachment, localAttachmentItems } from './attachment-view.ts';
import type { ComposerAttachment } from './chat-draft-attachments.ts';

export function ComposerAttachments({
    attachments,
    onRemove,
}: {
    attachments: ComposerAttachment[];
    onRemove: (nonce: string) => void;
}) {
    const reduceMotion = useReducedMotion();

    if (attachments.length === 0) {
        return null;
    }

    // Tiles pop in and out in place while their neighbors slide to close the
    // gap, so adding or removing one never jumps the row.
    const presence = reduceMotion
        ? { animate: { opacity: 1 }, exit: { opacity: 0 }, initial: { opacity: 0 } }
        : {
              animate: { opacity: 1, scale: 1 },
              exit: { opacity: 0, scale: 0.9 },
              initial: { opacity: 0, scale: 0.9 },
          };

    return (
        <PromptInput.Attachments>
            <ChatAttachmentGroup>
                <AnimatePresence initial={false} mode="popLayout">
                    {attachments.map((attachment) => (
                        <motion.div
                            key={attachment.nonce}
                            layout={!reduceMotion}
                            transition={springs.moderate}
                            {...presence}
                        >
                            <ComposerAttachmentTile
                                attachment={attachment}
                                onRemove={() => onRemove(attachment.nonce)}
                            />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </ChatAttachmentGroup>
        </PromptInput.Attachments>
    );
}

/**
 * A staged file in the composer's visual language: an image as a stock square
 * thumbnail decoded through the attachment image cache (the pending and
 * confirmed rows reuse that very decode), anything else as a file card with
 * the Artifacts file icon and "PDF · 243 KB".
 */
function ComposerAttachmentTile({
    attachment,
    onRemove,
}: {
    attachment: ComposerAttachment;
    onRemove: () => void;
}) {
    const [item] = localAttachmentItems([
        {
            file: attachment.file,
            filename: attachment.file.name,
            id: attachment.nonce,
            mediaType: attachment.mediaType || 'application/octet-stream',
            sizeBytes: attachment.file.size,
        },
    ]);
    const isImage = item?.kind === 'image';
    const preview = useAttachmentImage(
        { file: attachment.file, kind: 'local', nonce: attachment.nonce },
        { enabled: isImage }
    );
    const showImage = isImage && !preview.failed;

    return (
        <ChatAttachment
            mediaType={showImage ? 'image' : 'document'}
            mimeType={attachment.mediaType}
            name={attachment.file.name}
            size={attachment.file.size}
            src={showImage ? preview.image?.url : undefined}
        >
            {showImage ? (
                <ChatAttachment.Preview />
            ) : (
                <ChatAttachment.Preview>
                    <ArtifactFileIcon kind={item?.kind ?? 'other'} size={32} />
                </ChatAttachment.Preview>
            )}
            <ChatAttachment.Info>
                <ChatAttachment.Name />
                <ChatAttachment.Size>{item ? describeAttachment(item) : null}</ChatAttachment.Size>
            </ChatAttachment.Info>
            <ChatAttachment.Remove
                aria-label={`Remove ${attachment.file.name}`}
                onPress={onRemove}
            />
        </ChatAttachment>
    );
}
