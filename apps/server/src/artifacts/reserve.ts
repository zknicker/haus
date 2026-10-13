import { type ArtifactPublishInput, artifactPathBasename, artifactPathKey } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { liveArtifactAtPath, placeArtifactPath } from './path.ts';
import { ArtifactError, artifactMaxBytes } from './storage.ts';

/**
 * What the head must still be when the upload lands: `replace` overwrites whatever it is,
 * otherwise the head must equal `base` (null for a create).
 */
export type ArtifactWriteExpectation = { replace: true } | { replace: false; base: string | null };

export async function reserveArtifact(
    db: HausDatabase,
    access: ArtifactAccess,
    input: ArtifactPublishInput,
    budget: number,
    origin: string
) {
    return await db.transaction(async (tx) => {
        const [server] = await tx
            .select({ id: serversTable.id })
            .from(serversTable)
            .where(and(eq(serversTable.id, access.serverId), isNull(serversTable.deletedAt)))
            .for('update');
        if (!server) {
            throw new ArtifactError('Server was deleted.', 404, 'NOT_FOUND');
        }
        const [existing] = await tx
            .select()
            .from(revisions)
            .where(
                and(
                    eq(revisions.serverId, access.serverId),
                    eq(revisions.authorKey, access.authorKey),
                    eq(revisions.requestId, input.request_id)
                )
            )
            .limit(1);
        if (existing) {
            const [artifact] = await tx
                .select()
                .from(artifacts)
                .where(eq(artifacts.id, existing.artifactId))
                .limit(1);
            const verifiedArtifact = verifyRetry(artifact, existing, input);
            if (existing.state !== 'ready') {
                throw new ArtifactError(
                    'That publication is in progress or failed. Use a new request_id after a failed upload.',
                    409,
                    'UPLOAD_CONFLICT'
                );
            }
            return {
                artifact: verifiedArtifact,
                expect: { replace: true } as ArtifactWriteExpectation,
                revision: existing,
                retry: true,
            };
        }
        const [used] = await tx
            .select({ total: sql<number>`coalesce(sum(${revisions.reservedBytes}), 0)::float8` })
            .from(revisions)
            .where(eq(revisions.serverId, access.serverId));
        requireStorageBudget(used?.total, budget);
        const { artifact, expect } = await writeTarget(tx, access, input, origin);
        const revisionId = createOpaqueId('rev');
        const [revision] = await tx
            .insert(revisions)
            .values({
                artifactId: artifact.id,
                authorAgentId: access.agentId,
                authorKey: access.authorKey,
                authorUserId: access.userId,
                contentType: input.content_type,
                filename: artifactPathBasename(artifact.path),
                id: revisionId,
                objectKey: `servers/${access.serverId}/artifacts/${artifact.id}/${revisionId}`,
                requestId: input.request_id,
                reservedBytes: artifactMaxBytes,
                revisionNumber: artifact.nextRevision,
                serverId: access.serverId,
                state: 'uploading',
                title: publishTitle(input),
            })
            .returning();
        await tx
            .update(artifacts)
            .set({ nextRevision: artifact.nextRevision + 1 })
            .where(eq(artifacts.id, artifact.id));
        if (!revision) {
            throw new Error('Revision reservation did not return its row.');
        }
        return { artifact, expect, revision, retry: false };
    });
}

/**
 * A free path creates an artifact. An occupied path takes a revision only with `replace` or a
 * `base_revision_id` equal to its head; anything else fails fast, before any bytes move.
 */
async function writeTarget(
    tx: HausDatabase,
    access: ArtifactAccess,
    input: ArtifactPublishInput,
    origin: string
): Promise<{ artifact: typeof artifacts.$inferSelect; expect: ArtifactWriteExpectation }> {
    const baseRevisionId = input.base_revision_id ?? null;
    const occupant = await liveArtifactAtPath(tx, access.serverId, input.path);
    if (occupant) {
        if (input.replace) {
            return { artifact: occupant, expect: { replace: true } };
        }
        if (baseRevisionId && baseRevisionId === occupant.currentRevisionId) {
            return { artifact: occupant, expect: { base: baseRevisionId, replace: false } };
        }
        throw await revisionConflict(tx, access, origin, {
            artifactId: occupant.id,
            baseRevisionId,
            path: input.path,
        });
    }
    if (baseRevisionId) {
        throw await revisionConflict(tx, access, origin, {
            artifactId: null,
            baseRevisionId,
            path: input.path,
        });
    }
    const path = await placeArtifactPath(tx, access.serverId, input.path);
    const [artifact] = await tx
        .insert(artifacts)
        .values({
            creatorAgentId: access.agentId,
            creatorUserId: access.userId,
            id: createOpaqueId('art'),
            path,
            pathKey: artifactPathKey(path),
            serverId: access.serverId,
        })
        .returning();
    if (!artifact) {
        throw new Error('Artifact reservation did not return its row.');
    }
    return {
        artifact,
        expect: input.replace ? { replace: true } : { base: null, replace: false },
    };
}

function publishTitle(input: ArtifactPublishInput) {
    return input.title ?? artifactPathBasename(input.path);
}

/** A retry names the same path, title, and content type; bytes are checked after reading them. */
function verifyRetry(
    artifact: typeof artifacts.$inferSelect | undefined,
    revision: typeof revisions.$inferSelect,
    input: ArtifactPublishInput
) {
    if (!artifact || artifact.deletedAt) {
        throw new ArtifactError('That publication was deleted.', 409, 'DELETED');
    }
    const matches =
        artifact.pathKey === artifactPathKey(input.path) &&
        revision.contentType === input.content_type &&
        revision.title === publishTitle(input);
    if (!matches) {
        throw new ArtifactError(
            'That request_id belongs to a different publication.',
            409,
            'IDEMPOTENCY_KEY_REUSED'
        );
    }
    return artifact;
}

function requireStorageBudget(used: number | undefined, budget: number) {
    if ((used ?? 0) + artifactMaxBytes > budget) {
        throw new ArtifactError(
            'Server shared-file storage budget is exhausted.',
            507,
            'STORAGE_LIMIT'
        );
    }
}
