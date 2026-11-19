import {
    type ArtifactMetadata,
    artifactPublishResultSchema,
    artifactRevisionConflictSchema,
} from '@haus/api';
import * as z from 'zod';

export type ArtifactUploadOutcome =
    | { kind: 'published'; artifact: ArtifactMetadata }
    | { kind: 'conflict'; current: ArtifactMetadata | null; message: string }
    | { kind: 'failed'; code: string; message: string }
    | { kind: 'unconfirmed'; message: string };

const errorBodySchema = z.object({ code: z.string().min(1), message: z.string() });

export async function readUploadResponse(response: Response) {
    if (response.status >= 500) {
        return unconfirmed();
    }
    const body = await response.json().then(
        (parsed: unknown) => ({ parsed }),
        () => null
    );
    if (body === null) {
        return response.ok ? unconfirmed() : failed(`HTTP_${response.status}`, response.statusText);
    }
    if (response.ok) {
        const published = artifactPublishResultSchema.safeParse(body.parsed);
        return published.success
            ? ({
                  artifact: published.data.artifact,
                  kind: 'published',
              } satisfies ArtifactUploadOutcome)
            : unconfirmed();
    }
    const conflict = artifactRevisionConflictSchema.safeParse(body.parsed);
    if (conflict.success) {
        return {
            current: conflict.data.current,
            kind: 'conflict',
            message: conflict.data.message,
        } satisfies ArtifactUploadOutcome;
    }
    const error = errorBodySchema.safeParse(body.parsed);
    return error.success
        ? failed(error.data.code, error.data.message)
        : failed(`HTTP_${response.status}`, JSON.stringify(body.parsed));
}

function failed(code: string, message: string) {
    return { code, kind: 'failed', message } satisfies ArtifactUploadOutcome;
}

function unconfirmed() {
    return {
        kind: 'unconfirmed',
        message: 'The upload may have landed, but its response could not be read.',
    } satisfies ArtifactUploadOutcome;
}
