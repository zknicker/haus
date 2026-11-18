import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    hostedAttachmentImageQuery,
    localAttachmentImageQuery,
    watchAttachmentImageRevocation,
} from './attachment-image.ts';

/** Where an attachment image's bytes come from: the Server, or a File still on this device. */
export type AttachmentImageSource =
    | { attachmentId: string; kind: 'hosted'; serverId: string }
    | { file: Blob; kind: 'local'; nonce: string };

/**
 * The decoded image for one attachment, shared by every row that shows it.
 * `failed` means the bytes are not drawable (or retries gave up); callers
 * render the file tile instead of a broken image.
 */
export function useAttachmentImage(source: AttachmentImageSource, { enabled = true } = {}) {
    const queryClient = useQueryClient();
    watchAttachmentImageRevocation(queryClient);
    const query = useQuery<{ height: number; url: string; width: number }, Error>({
        ...(source.kind === 'hosted'
            ? hostedAttachmentImageQuery(source)
            : localAttachmentImageQuery(source)),
        enabled,
    });

    return { failed: query.isError, image: query.data ?? null };
}
