import { type ArtifactMetadata, artifactPublishResultSchema } from '@haus/api';
import { getHausServerOrigin } from '../../lib/haus-server.tsx';

const contentTypePattern = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u;

/**
 * How long an upload may go without progress before it fails. The Server
 * streams bytes straight to storage, so a storage stall stops the upload's
 * progress (or, once every byte is sent, its answer) rather than failing it.
 */
export const artifactUploadStallMs = 45_000;

/** The upload was cancelled by the member, not refused or failed. */
export class ArtifactUploadCancelled extends Error {
    constructor() {
        super('Upload cancelled.');
    }
}

/**
 * Publishes one file through the member upload route
 * (`PUT /artifacts/:serverId/publish`): raw bytes, metadata in the query, a
 * fresh `request_id` per write. XHR rather than fetch so the upload reports
 * bytes sent. `replace` deliberately overwrites whatever head the path has.
 * Fails after `stallMs` without progress, and aborts with `signal`.
 */
export function publishArtifactFile(input: {
    file: Blob;
    onProgress: (sentBytes: number) => void;
    path: string;
    replace: boolean;
    serverId: string;
    signal?: AbortSignal;
    stallMs?: number;
    token: string;
}): Promise<ArtifactMetadata> {
    const url = new URL(
        `/artifacts/${encodeURIComponent(input.serverId)}/publish`,
        getHausServerOrigin()
    );
    url.searchParams.set('path', input.path);
    url.searchParams.set('request_id', `upl_${crypto.randomUUID()}`);
    if (input.replace) {
        url.searchParams.set('replace', 'true');
    }
    if (contentTypePattern.test(input.file.type)) {
        url.searchParams.set('content_type', input.file.type);
    }
    const stallMs = input.stallMs ?? artifactUploadStallMs;

    return new Promise((resolve, reject) => {
        if (input.signal?.aborted) {
            reject(new ArtifactUploadCancelled());
            return;
        }
        const request = new XMLHttpRequest();
        let stall: ReturnType<typeof setTimeout> | undefined;
        const settle = (finish: () => void) => {
            clearTimeout(stall);
            input.signal?.removeEventListener('abort', cancel);
            finish();
        };
        const fail = (error: Error) => {
            request.abort();
            settle(() => reject(error));
        };
        // Re-armed by every progress event: only silence counts as a stall.
        const watch = () => {
            clearTimeout(stall);
            stall = setTimeout(
                () =>
                    fail(
                        new Error(
                            `The upload stalled: nothing moved for ${Math.round(stallMs / 1000)} seconds.`
                        )
                    ),
                stallMs
            );
        };
        const cancel = () => fail(new ArtifactUploadCancelled());
        input.signal?.addEventListener('abort', cancel);
        request.open('PUT', url);
        request.setRequestHeader('authorization', `Bearer ${input.token}`);
        request.setRequestHeader('content-type', 'application/octet-stream');
        request.upload.onprogress = (event) => {
            watch();
            input.onProgress(event.loaded);
        };
        request.onerror = () =>
            settle(() => reject(new Error('The upload could not reach the Server.')));
        request.onload = () =>
            settle(() => {
                const body = parseJson(request.responseText);
                if (request.status >= 200 && request.status < 300) {
                    const result = artifactPublishResultSchema.safeParse(body);
                    if (result.success) {
                        resolve(result.data.artifact);
                        return;
                    }
                    reject(new Error('The Server returned an invalid upload response.'));
                    return;
                }
                reject(new Error(errorMessage(body) ?? `Upload failed (${request.status}).`));
            });
        watch();
        request.send(input.file);
    });
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function errorMessage(body: unknown): string | null {
    return typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
        ? body.message
        : null;
}
