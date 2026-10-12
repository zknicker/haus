import type { ArtifactCreatorSummary } from '@haus/api';
import { and, asc, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { artifactCreator, artifactMetadata } from './read.ts';

const previewLimit = 3;

/**
 * One summary per creator with at least one live artifact: its count and up to three most
 * recently updated artifacts, ordered by latest update. Ranking and counting happen in one query.
 */
export async function listArtifactCreators(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string
): Promise<ArtifactCreatorSummary[]> {
    const access = await artifactAccess(db, actor);
    const creatorPartition = sql`partition by ${artifacts.creatorAgentId}, ${artifacts.creatorUserId}`;
    const ranked = db
        .select({
            artifactCount: sql<number>`count(*) over (${creatorPartition})`
                .mapWith(Number)
                .as('artifact_count'),
            artifactId: sql<string>`${artifacts.id}`.as('ranked_artifact_id'),
            rank: sql<number>`row_number() over (${creatorPartition} order by ${revisions.createdAt} desc, ${artifacts.id} desc)`
                .mapWith(Number)
                .as('creator_rank'),
        })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .where(liveArtifacts(access.serverId))
        .as('ranked');
    const rows = await db
        .select({
            artifact: artifacts,
            artifactCount: ranked.artifactCount,
            rank: ranked.rank,
            revision: revisions,
        })
        .from(ranked)
        .innerJoin(
            artifacts,
            and(eq(artifacts.serverId, access.serverId), eq(artifacts.id, ranked.artifactId))
        )
        .innerJoin(revisions, currentRevision())
        .where(and(lte(ranked.rank, previewLimit), liveArtifacts(access.serverId)))
        .orderBy(desc(revisions.createdAt), asc(ranked.rank), desc(artifacts.id));
    const summaries = new Map<string, ArtifactCreatorSummary>();
    for (const row of rows) {
        const creator = artifactCreator(row.artifact);
        const key =
            creator.type === 'agent' ? `agent:${creator.agent_id}` : `user:${creator.user_id}`;
        const preview = artifactMetadata(row, origin, access.slug);
        const summary = summaries.get(key);
        if (summary) {
            summary.previews.push(preview);
            continue;
        }
        // Rows arrive newest first, so the first row per creator carries its latest update.
        summaries.set(key, {
            artifact_count: Number(row.artifactCount),
            creator,
            latest_at: preview.updated_at,
            previews: [preview],
        });
    }
    return [...summaries.values()];
}

function currentRevision() {
    return and(
        eq(revisions.serverId, artifacts.serverId),
        eq(revisions.artifactId, artifacts.id),
        eq(revisions.id, artifacts.currentRevisionId)
    );
}

function liveArtifacts(serverId: string) {
    return and(
        eq(artifacts.serverId, serverId),
        isNull(artifacts.deletedAt),
        eq(revisions.state, 'ready')
    );
}
