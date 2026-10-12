import type { ArtifactPublishInput } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { ArtifactError, artifactMaxBytes } from './storage.ts';

export async function reserveArtifact(
    db: HausDatabase,
    access: ArtifactAccess,
    input: ArtifactPublishInput,
    budget: number
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
            return { artifact: verifiedArtifact, revision: existing, retry: true };
        }
        const [used] = await tx
            .select({ total: sql<number>`coalesce(sum(${revisions.reservedBytes}), 0)::float8` })
            .from(revisions)
            .where(eq(revisions.serverId, access.serverId));
        requireStorageBudget(used?.total, budget);
        let [artifact] = await tx
            .select()
            .from(artifacts)
            .where(
                and(
                    eq(artifacts.serverId, access.serverId),
                    isNull(artifacts.deletedAt),
                    input.artifact_id
                        ? eq(artifacts.id, input.artifact_id)
                        : eq(artifacts.name, input.name ?? '')
                )
            )
            .limit(1);
        if (!artifact) {
            if (input.artifact_id) {
                throw new ArtifactError('Artifact was not found.', 404, 'NOT_FOUND');
            }
            [artifact] = await tx
                .insert(artifacts)
                .values({
                    creatorAgentId: access.agentId,
                    creatorUserId: access.userId,
                    id: createOpaqueId('art'),
                    name: input.name ?? '',
                    serverId: access.serverId,
                })
                .returning();
        }
        if (!artifact) {
            throw new Error('Artifact reservation did not return its row.');
        }
        const revisionId = createOpaqueId('rev');
        const [revision] = await tx
            .insert(revisions)
            .values({
                artifactId: artifact.id,
                authorAgentId: access.agentId,
                authorKey: access.authorKey,
                authorUserId: access.userId,
                contentType: input.content_type,
                filename: input.filename,
                id: revisionId,
                objectKey: `servers/${access.serverId}/artifacts/${artifact.id}/${revisionId}`,
                requestId: input.request_id,
                reservedBytes: artifactMaxBytes,
                revisionNumber: artifact.nextRevision,
                serverId: access.serverId,
                state: 'uploading',
                title: input.title,
            })
            .returning();
        await tx
            .update(artifacts)
            .set({ nextRevision: artifact.nextRevision + 1 })
            .where(eq(artifacts.id, artifact.id));
        if (!revision) {
            throw new Error('Revision reservation did not return its row.');
        }
        return { artifact, revision, retry: false };
    });
}

function verifyRetry(
    artifact: typeof artifacts.$inferSelect | undefined,
    revision: typeof revisions.$inferSelect,
    input: ArtifactPublishInput
) {
    if (!artifact || artifact.deletedAt) {
        throw new ArtifactError('That publication was deleted.', 409, 'DELETED');
    }
    const matches =
        revision.filename === input.filename &&
        revision.contentType === input.content_type &&
        revision.title === input.title;
    const sameTarget = input.artifact_id
        ? input.artifact_id === artifact.id
        : input.name === artifact.name;
    if (!(matches && sameTarget)) {
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
