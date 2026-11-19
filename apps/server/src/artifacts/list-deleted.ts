import { type ArtifactDeletedRecord, driveDeletedRetentionDays } from '@haus/api';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { insideFolder } from './path.ts';
import { artifactRecord } from './read.ts';

const pageSize = 50;
const windowMs = driveDeletedRetentionDays * 24 * 60 * 60 * 1000;

export async function listDeletedArtifacts(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    input: { offset: number; prefix: string },
    now = new Date()
) {
    const access = await artifactAccess(db, actor);
    const rows = await db
        .select({ artifact: artifacts, revision: revisions })
        .from(artifacts)
        .innerJoin(
            revisions,
            and(
                eq(revisions.serverId, artifacts.serverId),
                eq(revisions.artifactId, artifacts.id),
                eq(revisions.id, artifacts.currentRevisionId)
            )
        )
        .where(
            and(
                eq(artifacts.serverId, access.serverId),
                gt(artifacts.deletedAt, new Date(now.getTime() - windowMs)),
                eq(revisions.state, 'ready'),
                input.prefix ? insideFolder(input.prefix) : undefined
            )
        )
        .orderBy(desc(artifacts.deletedAt), artifacts.id)
        .limit(pageSize + 1)
        .offset(input.offset);
    const deleted = rows.slice(0, pageSize).map(
        (row) =>
            ({
                artifact: artifactRecord(row, origin, access.slug),
                deleted_at: deletedAt(row.artifact),
            }) satisfies ArtifactDeletedRecord
    );
    return {
        deleted,
        next_offset: rows.length > pageSize ? input.offset + pageSize : null,
    };
}

function deletedAt(artifact: typeof artifacts.$inferSelect) {
    if (!artifact.deletedAt) {
        throw new Error('A listed deleted file has no deletion time.');
    }
    return artifact.deletedAt.toISOString();
}
