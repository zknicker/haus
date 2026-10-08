import {
    ChatAttachment,
    ChatAttachmentGroup,
    formatChatAttachmentSize,
    PromptInput,
} from '@heroui-pro/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { springs } from '../../../lib/springs.ts';
import type { ComposerAttachment } from './chat-draft-attachments.ts';

const extensionPattern = /\.([a-z0-9]{1,5})$/iu;

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
                            <ChatAttachment
                                mimeType={attachment.file.type}
                                name={attachment.file.name}
                                size={attachment.file.size}
                                src={attachment.previewUrl}
                            >
                                <ChatAttachment.Preview />
                                <ChatAttachment.Info>
                                    <ChatAttachment.Name />
                                    <ChatAttachment.Size>
                                        {describeFile(attachment.file)}
                                    </ChatAttachment.Size>
                                </ChatAttachment.Info>
                                <ChatAttachment.Remove
                                    aria-label={`Remove ${attachment.file.name}`}
                                    onPress={() => onRemove(attachment.nonce)}
                                />
                            </ChatAttachment>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </ChatAttachmentGroup>
        </PromptInput.Attachments>
    );
}

/** "PDF · 243 KB": the kind a reader scans for, then the size. */
function describeFile(file: File) {
    const extension = file.name.match(extensionPattern)?.[1]?.toUpperCase();
    const size = formatChatAttachmentSize(file.size);
    return extension ? `${extension} · ${size}` : size;
}
