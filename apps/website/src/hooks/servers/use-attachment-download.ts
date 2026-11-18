import { useMutation } from '@tanstack/react-query';
import { fetchAttachmentBlob, saveAttachmentBlob } from './attachment-bytes.ts';

export function useAttachmentDownload() {
    return useMutation({
        mutationFn: async ({
            attachmentId,
            filename,
            serverId,
        }: {
            attachmentId: string;
            filename: string;
            serverId: string;
        }) => {
            const blob = await fetchAttachmentBlob({ attachmentId, serverId });
            saveAttachmentBlob(blob, filename);
        },
    });
}
