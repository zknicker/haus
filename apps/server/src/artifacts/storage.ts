import { createHash } from 'node:crypto';
import { S3Client } from 'bun';
import { attachmentDisposition } from '../utils/content-disposition.ts';

export interface ArtifactStorage {
    delete(key: string): Promise<void>;
    /** With `saveAs`, the link downloads as that filename instead of rendering inline. */
    downloadUrl(key: string, saveAs?: string): string;
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
        readonly code: string
    ) {
        super(message);
    }
}
export const artifactMaxBytes = 268_435_456;
export const artifactStorageBytes = 10_737_418_240;

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
