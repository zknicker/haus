import type { ImageGeneration } from '@haus/api';
import { useMutation } from '@tanstack/react-query';
import { imageGenerationFilename } from '../../features/image-generation/image-generation-presentation.ts';
import { fetchAttachmentBlob, saveAttachmentBlob } from './attachment-bytes.ts';

/** Save Image As for a ready generation: the attachment's bytes, named for the generation. */
export function useImageGenerationDownload(serverId: string) {
    return useMutation({
        mutationFn: async (generation: ImageGeneration) => {
            if (generation.result.state !== 'ready') {
                return;
            }
            const blob = await fetchAttachmentBlob({
                attachmentId: generation.result.attachmentId,
                serverId,
            });
            saveAttachmentBlob(blob, imageGenerationFilename(generation, blob.type));
        },
    });
}
