import { artifactPathKey } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { currentArtifactMetadata } from './read.ts';
import { ArtifactError } from './storage.ts';

/**
 * Builds the 409 a stale write receives. `current` is the head of the artifact the base revision
 * belongs to, wherever it lives now (so a moved file reports its new path), falling back to the
 * artifact at the written path.
 */
export async function revisionConflict(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'serverId' | 'slug'>,
    origin: string,
    write: { path: string; baseRevisionId: string | null; artifactId: string | null }
) {
    const baseArtifactId = write.baseRevisionId
        ? await liveArtifactOwning(tx, access.serverId, write.baseRevisionId)
        : null;
    const artifactId = baseArtifactId ?? write.artifactId;
    const current = artifactId
        ? await currentArtifactMetadata(tx, access.serverId, artifactId, origin, access.slug)
        : null;
    return new ArtifactError(conflictMessage(write, current), 409, 'REVISION_CONFLICT', current);
}

function conflictMessage(
    write: { path: string; baseRevisionId: string | null; artifactId: string | null },
    current: Awaited<ReturnType<typeof currentArtifactMetadata>>
) {
    if (!current) {
        return write.artifactId
            ? `Another publish to \`${write.path}\` is still in progress. Retry once it lands.`
            : `Nothing lives at \`${write.path}\` now. Drop base_revision_id to create it.`;
    }
    const retry = `Merge onto ${current.revision_id} and retry with base_revision_id ${current.revision_id}, or pass replace to overwrite it.`;
    if (!write.baseRevisionId) {
        return `\`${current.path}\` already exists (head ${current.revision_id}). ${retry}`;
    }
    if (artifactPathKey(current.path) !== artifactPathKey(write.path)) {
        return `${write.baseRevisionId} belongs to \`${current.path}\` now (head ${current.revision_id}). Write to that path instead.`;
    }
    return `\`${current.path}\` moved on: its head is ${current.revision_id} (revision ${current.revision_number}), not ${write.baseRevisionId}. ${retry}`;
}

async function liveArtifactOwning(tx: HausDatabase, serverId: string, revisionId: string) {
    const [row] = await tx
        .select({ id: artifacts.id })
        .from(revisions)
        .innerJoin(
            artifacts,
            and(eq(artifacts.serverId, revisions.serverId), eq(artifacts.id, revisions.artifactId))
        )
        .where(
            and(
                eq(revisions.serverId, serverId),
                eq(revisions.id, revisionId),
                isNull(artifacts.deletedAt)
            )
        )
        .limit(1);
    return row?.id ?? null;
}
