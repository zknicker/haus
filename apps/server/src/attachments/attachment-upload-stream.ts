import { createHash } from 'node:crypto';
import { attachmentMediaTypeSniffBytes } from '@haus/api';
import type { AttachmentRoot } from './attachment-root.ts';
import { AttachmentUploadError } from './attachment-upload-model.ts';
import { attachmentMaxSizeBytes } from './reserve-attachment.ts';

export async function streamAttachmentToFile(
    file: Awaited<ReturnType<AttachmentRoot['createStagingFile']>>,
    stream: AsyncIterable<Uint8Array>
) {
    return await digestAttachmentStream(stream, async (chunk) => {
        await file.write(chunk);
    });
}

export async function digestAttachmentStream(
    stream: AsyncIterable<Uint8Array>,
    onChunk?: (chunk: Buffer) => Promise<void>
) {
    const hash = createHash('sha256');
    const headChunks: Buffer[] = [];
    let headBytes = 0;
    let sizeBytes = 0;

    for await (const rawChunk of stream) {
        const chunk = Buffer.from(rawChunk);
        sizeBytes += chunk.byteLength;
        if (sizeBytes > attachmentMaxSizeBytes) {
            throw new AttachmentUploadError('Attachment exceeds the 50 MiB limit.', 'size_limit');
        }
        hash.update(chunk);
        // Keep just enough leading bytes to sniff the media type at finalize.
        if (headBytes < attachmentMediaTypeSniffBytes) {
            headChunks.push(chunk.subarray(0, attachmentMediaTypeSniffBytes - headBytes));
            headBytes += headChunks.at(-1)?.byteLength ?? 0;
        }
        await onChunk?.(chunk);
    }

    return { head: Buffer.concat(headChunks), sha256: hash.digest('hex'), sizeBytes };
}
