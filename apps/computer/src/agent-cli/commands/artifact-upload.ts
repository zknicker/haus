import {
    type ArtifactMetadata,
    artifactPublishResultSchema,
    artifactRevisionConflictSchema,
} from '@haus/api';
import * as z from 'zod';
import { applyServerAcceptEncoding } from '../../server-encoding.ts';
import { resolveAgentContext } from '../agent-context.ts';

export const artifactMaxUploadBytes = 256 * 1024 ** 2;

export interface ArtifactUploadInput {
    baseRevisionId?: string;
    contentType: string;
    file: string;
    path: string;
    replace: boolean;
    requestId: string;
    title?: string;
}

/** What one raw publish ended as. Only `unconfirmed` may have changed the drive unseen. */
export type ArtifactUploadOutcome =
    | { kind: 'published'; artifact: ArtifactMetadata }
    | { kind: 'conflict'; current: ArtifactMetadata | null; message: string }
    | { kind: 'failed'; code: string; message: string }
    | { kind: 'unconfirmed'; message: string };

export type ArtifactUploader = (input: ArtifactUploadInput) => Promise<ArtifactUploadOutcome>;

const errorBodySchema = z.object({ code: z.string().min(1), message: z.string() });

/** Streams one file to the raw publish route through the Computer proxy. */
export const uploadArtifact: ArtifactUploader = async (input) => {
    const context = resolveAgentContext();
    const url = new URL('/api/agent/artifacts/publish-artifact-raw', context.serverUrl);
    for (const [key, value] of Object.entries({
        path: input.path,
        base_revision_id: input.baseRevisionId,
        replace: input.replace ? 'true' : undefined,
        title: input.title,
        content_type: input.contentType,
        request_id: input.requestId,
    })) {
        if (value) {
            url.searchParams.set(key, value);
        }
    }
    const file = Bun.file(input.file);
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            body: file,
            headers: applyServerAcceptEncoding(
                new Headers({
                    authorization: `Bearer ${context.token}`,
                    'content-length': String(file.size),
                    'content-type': 'application/octet-stream',
                })
            ),
            signal: AbortSignal.timeout(300_000),
        });
    } catch {
        return unconfirmed();
    }
    return await readUploadResponse(response);
};

export async function readUploadResponse(response: Response): Promise<ArtifactUploadOutcome> {
    if (response.status >= 500) {
        return unconfirmed();
    }
    let body: unknown;
    try {
        body = await response.json();
    } catch {
        return response.ok
            ? unconfirmed()
            : { kind: 'failed', code: `HTTP_${response.status}`, message: response.statusText };
    }
    if (response.ok) {
        const parsed = artifactPublishResultSchema.safeParse(body);
        return parsed.success
            ? { kind: 'published', artifact: parsed.data.artifact }
            : unconfirmed();
    }
    const conflict = artifactRevisionConflictSchema.safeParse(body);
    if (conflict.success) {
        return { kind: 'conflict', current: conflict.data.current, message: conflict.data.message };
    }
    const error = errorBodySchema.safeParse(body);
    return error.success
        ? { kind: 'failed', code: error.data.code, message: error.data.message }
        : { kind: 'failed', code: `HTTP_${response.status}`, message: JSON.stringify(body) };
}

function unconfirmed(): ArtifactUploadOutcome {
    return {
        kind: 'unconfirmed',
        message:
            'The upload may have landed, but its response could not be read. Run the same push again; it reuses the request id, so a landed upload is not duplicated.',
    };
}
