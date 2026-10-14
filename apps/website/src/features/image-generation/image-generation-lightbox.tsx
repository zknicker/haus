import { ImageLightbox } from '../../components/chats/image-lightbox.tsx';
import { useAttachmentImage } from '../../hooks/servers/use-attachment-image.ts';
import { useImageGenerationDownload } from '../../hooks/servers/use-image-generation-download.ts';
import { ImageGenerationDetails, type ReadyImageGeneration } from './image-generation-details.tsx';
import { imageGenerationFilename } from './image-generation-presentation.ts';

/**
 * The attachment viewer over one strip's ready images, with a details panel
 * for the generation on screen. Paging, zoom, and save are the stock viewer's.
 */
export function ImageGenerationLightbox({
    generations,
    index,
    onClose,
    onIndexChange,
    serverId,
}: {
    /** Ready generations only; `index` names one of them. */
    generations: readonly ReadyImageGeneration[];
    index: number;
    onClose: () => void;
    onIndexChange: (index: number) => void;
    serverId: string;
}) {
    const generation = generations[index] ?? generations[0];
    const attachmentId = generation?.result.attachmentId;
    const loaded = useAttachmentImage(
        { attachmentId: attachmentId ?? '', kind: 'hosted', serverId },
        { enabled: attachmentId !== undefined }
    );
    const download = useImageGenerationDownload(serverId);

    // Blank for the instant a stepped-to image is still decoding.
    if (!(generation && loaded.image)) {
        return null;
    }
    return (
        <ImageLightbox
            dataUrl={loaded.image.url}
            details={<ImageGenerationDetails generation={generation} />}
            download={{
                disabled: download.isPending,
                kind: 'action',
                onDownload: () => download.mutate(generation),
            }}
            filename={imageGenerationFilename(generation)}
            height={loaded.image.height}
            navigation={
                generations.length > 1
                    ? {
                          onNext:
                              index < generations.length - 1
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
