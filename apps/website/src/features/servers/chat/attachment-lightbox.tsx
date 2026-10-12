import { ImageLightbox } from '../../../components/chats/image-lightbox.tsx';
import { useAttachmentImage } from '../../../hooks/servers/use-attachment-image.ts';
import type { MessageAttachmentItem } from './attachment-view.ts';

/**
 * The full image viewer over one message's images, opened at `index`, with
 * Previous and Next (buttons and arrow keys) across the rest. Each image reads
 * the same decoded-image cache its strip tile drew from, so stepping is instant.
 */
export function AttachmentLightbox({
    downloadDisabled,
    images,
    index,
    onClose,
    onDownload,
    onIndexChange,
}: {
    downloadDisabled: boolean;
    /** Never empty; `index` always names one of them. */
    images: readonly [MessageAttachmentItem, ...MessageAttachmentItem[]];
    index: number;
    onClose: () => void;
    onDownload?: (attachment: MessageAttachmentItem) => void;
    onIndexChange: (index: number) => void;
}) {
    const attachment = images[index] ?? images[0];
    const loaded = useAttachmentImage(attachment.source);

    // Blank for the instant a stepped-to image is still decoding.
    if (!loaded.image) {
        return null;
    }

    return (
        <ImageLightbox
            dataUrl={loaded.image.url}
            download={{
                disabled: downloadDisabled || !onDownload,
                kind: 'action',
                onDownload: () => onDownload?.(attachment),
            }}
            filename={attachment.filename}
            height={loaded.image.height}
            navigation={
                images.length > 1
                    ? {
                          onNext:
                              index < images.length - 1
                                  ? () => onIndexChange(index + 1)
                                  : undefined,
                          onPrevious: index > 0 ? () => onIndexChange(index - 1) : undefined,
                      }
                    : undefined
            }
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
            open
            width={loaded.image.width}
        />
    );
}
