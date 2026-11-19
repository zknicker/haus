import { createHash } from 'node:crypto';
import { artifactPathKey, type DrivePushOutcome } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ArtifactAccess } from '../../artifacts/access.ts';
import { ArtifactError, artifactMaxBytes } from '../../artifacts/storage.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { drivePushOutcomesTable as outcomes } from '../../postgres/schema.ts';
import { liveAt } from './outcomes.ts';

type PushAccess = Pick<ArtifactAccess, 'authorKey' | 'serverId'>;

export type PushRequest =
    | { operation: 'put'; baseRevisionId: string | null; contentType: string; pathKey: string }
    | { operation: 'delete'; baseRevisionId: string; pathKey: string };

interface StoredOutcome {
    contentSha256: string | null;
    outcome: DrivePushOutcome;
}

export function putRequest(input: {
    base_revision_id?: string;
    content_type: string;
    path: string;
}) {
    return {
        baseRevisionId: input.base_revision_id ?? null,
        contentType: input.content_type,
        operation: 'put',
        pathKey: artifactPathKey(input.path),
    } satisfies PushRequest;
}

export function deleteRequest(input: { base_revision_id: string; path: string }) {
    return {
        baseRevisionId: input.base_revision_id,
        operation: 'delete',
        pathKey: artifactPathKey(input.path),
    } satisfies PushRequest;
}

export async function storedOutcome(
    db: HausDatabase,
    access: PushAccess,
    requestId: string,
    request: PushRequest
) {
    const [row] = await db
        .select()
        .from(outcomes)
        .where(
            and(
                eq(outcomes.serverId, access.serverId),
                eq(outcomes.authorKey, access.authorKey),
                eq(outcomes.requestId, requestId)
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const contentType = request.operation === 'put' ? request.contentType : null;
    if (
        row.operation !== request.operation ||
        row.pathKey !== request.pathKey ||
        row.baseRevisionId !== request.baseRevisionId ||
        row.contentType !== contentType
    ) {
        throw reusedRequestId();
    }
    return { contentSha256: row.contentSha256, outcome: row.outcome } satisfies StoredOutcome;
}

export async function replayPut(stored: StoredOutcome, stream: AsyncIterable<Uint8Array>) {
    if (stored.contentSha256 !== null && (await bodySha256(stream)) !== stored.contentSha256) {
        throw reusedRequestId();
    }
    return stored.outcome;
}

export async function recordOutcome(
    tx: HausDatabase,
    access: PushAccess,
    write: {
        contentSha256: string | null;
        outcome: DrivePushOutcome;
        pushId: string;
        request: PushRequest;
        requestId: string;
    }
) {
    const { request } = write;
    const [stored] = await tx
        .insert(outcomes)
        .values({
            authorKey: access.authorKey,
            baseRevisionId: request.baseRevisionId,
            contentSha256: write.contentSha256,
            contentType: request.operation === 'put' ? request.contentType : null,
            operation: request.operation,
            outcome: write.outcome,
            pathKey: request.pathKey,
            pushId: write.pushId,
            requestId: write.requestId,
            serverId: access.serverId,
        })
        .onConflictDoNothing()
        .returning({ outcome: outcomes.outcome });
    if (stored) {
        return stored.outcome;
    }
    const prior = await storedOutcome(tx, access, write.requestId, request);
    if (
        prior?.contentSha256 &&
        write.contentSha256 &&
        prior.contentSha256 !== write.contentSha256
    ) {
        throw reusedRequestId();
    }
    return prior?.outcome ?? write.outcome;
}

export async function recordRefusal(
    tx: HausDatabase,
    access: PushAccess,
    write: {
        cause: ArtifactError;
        contentSha256: string | null;
        path: string;
        pushId: string;
        request: PushRequest;
        requestId: string;
    }
) {
    return await recordOutcome(tx, access, {
        contentSha256: write.contentSha256,
        outcome: {
            code: write.cause.code,
            current: await liveAt(tx, access.serverId, write.path),
            message: write.cause.message,
            outcome: 'refused',
            path: write.path,
        },
        pushId: write.pushId,
        request: write.request,
        requestId: write.requestId,
    });
}

async function bodySha256(stream: AsyncIterable<Uint8Array>) {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.byteLength;
        if (size > artifactMaxBytes) {
            return null;
        }
        hash.update(chunk);
    }
    return hash.digest('hex');
}

function reusedRequestId() {
    return new ArtifactError(
        'That request_id was sent for a different change.',
        409,
        'IDEMPOTENCY_KEY_REUSED'
    );
}
