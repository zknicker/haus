import { type ArtifactPublishInput, artifactPathBasename, artifactPathKey } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { lockLiveServer } from './move.ts';
import { ArtifactError, artifactMaxBytes } from './storage.ts';
import { type ArtifactWriteExpectation, writeTarget } from './write-target.ts';

type Artifact = typeof artifacts.$inferSelect;
type Revision = typeof revisions.$inferSelect;

/** A request_id seen before replays its revision; a new one reserves storage for an upload. */
export type ArtifactReservation =
    | { retry: true; artifact: Artifact; revision: Revision }
    | { retry: false; artifact: Artifact; revision: Revision; expect: ArtifactWriteExpectation };

export async function reserveArtifact(
    db: HausDatabase,
    access: ArtifactAccess,
    write: { input: ArtifactPublishInput; merges: boolean; taskId: string | null },
    budget: number,
    origin: string
): Promise<ArtifactReservation> {
    const { input } = write;
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
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
            return await retryOf(tx, existing, input);
        }
        await requireStorageBudget(tx, access.serverId, budget);
        const { artifact, expect, path } = await writeTarget(
            tx,
            access,
            input,
            origin,
            write.merges
        );
        const revision = await insertUploadingRevision(tx, access, {
            artifact,
            base: expect.kind === 'replace' ? null : expect.base,
            contentType: input.content_type,
            path,
            requestId: input.request_id,
            taskId: write.taskId,
            title: publishTitle(input),
        });
        return { artifact, expect, retry: false, revision };
    });
}

export async function requireStorageBudget(tx: HausDatabase, serverId: string, budget: number) {
    const [used] = await tx
        .select({ total: sql<number>`coalesce(sum(${revisions.reservedBytes}), 0)::float8` })
        .from(revisions)
        .where(eq(revisions.serverId, serverId));
    if ((used?.total ?? 0) + artifactMaxBytes > budget) {
        throw new ArtifactError(
            'Server shared-file storage budget is exhausted.',
            507,
            'STORAGE_LIMIT'
        );
    }
}

export async function insertUploadingRevision(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'agentId' | 'authorKey' | 'serverId' | 'userId'>,
    write: {
        artifact: Artifact;
        base: string | null;
        contentType: string;
        path: string;
        requestId: string;
        taskId: string | null;
        title: string;
    }
) {
    const { artifact } = write;
    const revisionId = createOpaqueId('rev');
    const [revision] = await tx
        .insert(revisions)
        .values({
            artifactId: artifact.id,
            authorAgentId: access.agentId,
            authorKey: access.authorKey,
            authorUserId: access.userId,
            baseRevisionId: write.base,
            contentType: write.contentType,
            filename: artifactPathBasename(write.path),
            id: revisionId,
            objectKey: `servers/${access.serverId}/artifacts/${artifact.id}/${revisionId}`,
            requestId: write.requestId,
            reservedBytes: artifactMaxBytes,
            revisionNumber: artifact.nextRevision,
            serverId: access.serverId,
            state: 'uploading',
            taskId: write.taskId,
            title: write.title,
        })
        .returning();
    await tx
        .update(artifacts)
        .set({ nextRevision: artifact.nextRevision + 1 })
        .where(eq(artifacts.id, artifact.id));
    if (!revision) {
        throw new Error('Revision reservation did not return its row.');
    }
    return revision;
}

async function retryOf(tx: HausDatabase, existing: Revision, input: ArtifactPublishInput) {
    const [artifact] = await tx
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, existing.artifactId))
        .limit(1);
    const verifiedArtifact = verifyRetry(artifact, existing, input);
    if (existing.state === 'deleted' || existing.state === 'deleting') {
        throw new ArtifactError(
            'That publication landed earlier and its revision was since deleted or pruned. Read the file for its current head.',
            409,
            'DELETED'
        );
    }
    if (existing.state !== 'ready') {
        throw new ArtifactError(
            'That publication is in progress or failed. Use a new request_id after a failed upload.',
            409,
            'UPLOAD_CONFLICT'
        );
    }
    return { artifact: verifiedArtifact, retry: true as const, revision: existing };
}

function publishTitle(input: ArtifactPublishInput) {
    return input.title ?? artifactPathBasename(input.path);
}

/** A retry names the same path, title, and content type; bytes are checked after reading them. */
function verifyRetry(
    artifact: Artifact | undefined,
    revision: Revision,
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
