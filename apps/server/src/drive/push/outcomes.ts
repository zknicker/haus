import { createHash } from 'node:crypto';
import { type ArtifactErrorCode, artifactPathSchema, type DriveRevision } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { liveArtifactAtPath } from '../../artifacts/path.ts';
import { revisionAuthor } from '../../artifacts/read.ts';
import { ArtifactError } from '../../artifacts/storage.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../../postgres/schema.ts';

type Artifact = typeof artifacts.$inferSelect;
type Revision = typeof revisions.$inferSelect;

const refusalCodes = new Set<ArtifactErrorCode>([
    'AGENT_RESET',
    'CONTENT_TYPE',
    'FORBIDDEN',
    'INVALID_PATH',
    'PATH_CONFLICT',
    'SIZE_LIMIT',
]);

export function isRefusal(cause: unknown): cause is ArtifactError {
    return cause instanceof ArtifactError && refusalCodes.has(cause.code);
}

export async function liveAt(tx: HausDatabase, serverId: string, path: string) {
    const artifact = await liveArtifactAtPath(tx, serverId, path);
    return artifact ? await headOf(tx, artifact) : null;
}

export async function headOf(tx: HausDatabase, artifact: Artifact) {
    if (!artifact.currentRevisionId) {
        return null;
    }
    const [revision] = await tx
        .select()
        .from(revisions)
        .where(eq(revisions.id, artifact.currentRevisionId))
        .limit(1);
    return revision ? driveRevisionOf(artifact, revision) : null;
}

export function driveRevisionOf(artifact: Pick<Artifact, 'id' | 'path'>, revision: Revision) {
    if (!revision.sha256) {
        throw new Error(`Revision ${revision.id} is live without a digest.`);
    }
    return {
        artifact_id: artifact.id,
        author: revisionAuthor(revision),
        content_type: revision.contentType,
        path: artifact.path,
        revision_id: revision.id,
        sha256: revision.sha256,
        size_bytes: revision.byteSize,
    } satisfies DriveRevision;
}

export async function revisionOwner(tx: HausDatabase, serverId: string, revisionId: string) {
    const [row] = await tx
        .select({ artifactId: revisions.artifactId })
        .from(revisions)
        .where(and(eq(revisions.serverId, serverId), eq(revisions.id, revisionId)))
        .limit(1);
    return row?.artifactId ?? null;
}

export function requirePushPath(path: string) {
    const parsed = artifactPathSchema.safeParse(path);
    if (!parsed.success) {
        throw new ArtifactError(
            `path: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
            400,
            'INVALID_PATH'
        );
    }
    return parsed.data;
}

export function pushRevisionRequestId(requestId: string) {
    return `push_${createHash('sha256').update(requestId).digest('base64url')}`;
}
