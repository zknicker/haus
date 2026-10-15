import { createHash } from 'node:crypto';
import type { ArtifactErrorCode, ArtifactMetadata } from '@haus/api';
import { S3Client } from 'bun';
import { attachmentDisposition } from '../utils/content-disposition.ts';

export interface ArtifactStorage {
    delete(key: string): Promise<void>;
    /** With `saveAs`, the link downloads as that filename instead of rendering inline. */
    downloadUrl(key: string, saveAs?: string): string;
    /** At most the first `maxBytes` bytes of an object (one ranged GET). */
    read(key: string, maxBytes: number): Promise<Uint8Array>;
    upload(
        key: string,
        stream: AsyncIterable<Uint8Array>,
        contentType: string
    ): Promise<{ size: number; sha256: string }>;
}
export interface ArtifactR2Config {
    accessKeyId: string;
    bucket: string;
    endpoint: string;
    maxBytes?: number;
    secretAccessKey: string;
    sessionToken?: string;
}
export class ArtifactError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: ArtifactErrorCode,
        /** For `REVISION_CONFLICT`: the live head the write lost to, or null. */
        readonly current: ArtifactMetadata | null = null
    ) {
        super(message);
    }
}
export const artifactMaxBytes = 268_435_456;
/** Per-Server shared-file cap: a product guard, not a cost limit. */
export const artifactStorageBytes = 107_374_182_400;

export function createR2ArtifactStorage(config: ArtifactR2Config): ArtifactStorage {
    const client = new S3Client({ ...config, region: 'auto' });
    return {
        delete: async (key) => {
            await client.delete(key);
        },
        downloadUrl: (key, saveAs) =>
            client.file(key).presign({
                // Signed as response-content-disposition, so R2 answers with the override.
                ...(saveAs ? { contentDisposition: attachmentDisposition(saveAs) } : {}),
                expiresIn: 300,
                method: 'GET',
            }),
        read: async (key, maxBytes) => await client.file(key).slice(0, maxBytes).bytes(),
        upload: async (key, stream, contentType) => {
            const hash = createHash('sha256');
            let size = 0;
            async function* checkedBytes() {
                for await (const chunk of stream) {
                    size += chunk.byteLength;
                    if (size > (config.maxBytes ?? artifactMaxBytes)) {
                        throw new ArtifactError(
                            'Artifact exceeds the configured upload size limit.',
                            413,
                            'SIZE_LIMIT'
                        );
                    }
                    hash.update(chunk);
                    yield chunk;
                }
            }
            const iterator = checkedBytes();
            const body = new ReadableStream<Uint8Array>({
                cancel: async () => {
                    await iterator.return();
                },
                pull: async (controller) => {
                    try {
                        const result = await iterator.next();
                        if (result.done) {
                            controller.close();
                        } else {
                            controller.enqueue(result.value);
                        }
                    } catch (cause) {
                        controller.error(cause);
                    }
                },
            });
            await client.file(key).write(new Response(body), {
                type: contentType,
                partSize: 5 * 1024 * 1024,
                queueSize: 1,
            });
            return { sha256: hash.digest('hex'), size };
        },
    };
}

/** A revision's WebP thumbnail sits beside its original. */
export function artifactThumbnailKey(objectKey: string) {
    return `${objectKey}.thumb.webp`;
}

/** Deletes a revision's original and its thumbnail; deleting a key that never existed succeeds. */
export async function deleteRevisionObjects(storage: ArtifactStorage, objectKey: string) {
    await storage.delete(objectKey);
    await storage.delete(artifactThumbnailKey(objectKey));
}

export function requireArtifactStorage(storage: ArtifactStorage | null): ArtifactStorage {
    if (!storage) {
        throw new ArtifactError(
            'Shared files are unavailable. Configure Haus Server private R2 storage.',
            503,
            'STORAGE_UNAVAILABLE'
        );
    }
    return storage;
}
