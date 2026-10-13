import { type ArtifactMetadata, artifactPublishResultSchema } from '@haus/api';
import { getHausServerOrigin } from '../../lib/haus-server.tsx';

const contentTypePattern = /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/u;

/**
 * Publishes one file through the member upload route
 * (`PUT /artifacts/:serverId/publish`): raw bytes, metadata in the query, a
 * fresh `request_id` per write. XHR rather than fetch so the upload reports
 * bytes sent. `replace` deliberately overwrites whatever head the path has.
 */
export function publishArtifactFile(input: {
    file: Blob;
    onProgress: (sentBytes: number) => void;
    path: string;
    replace: boolean;
    serverId: string;
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

    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', url);
        request.setRequestHeader('authorization', `Bearer ${input.token}`);
        request.setRequestHeader('content-type', 'application/octet-stream');
        request.upload.onprogress = (event) => input.onProgress(event.loaded);
        request.onerror = () => reject(new Error('The upload could not reach the Server.'));
        request.onload = () => {
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
        };
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
