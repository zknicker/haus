import type { ArtifactCreator, ArtifactListInput, ArtifactMetadata } from '@haus/api';
import { and, desc, eq, ilike, isNull, not, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { ArtifactError, type ArtifactStorage, requireArtifactStorage } from './storage.ts';

export async function getArtifact(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    artifactId: string,
    revisionId?: string
) {
    const access = await artifactAccess(db, actor);
    const [row] = await db
        .select({ artifact: artifacts, revision: revisions })
        .from(artifacts)
        .innerJoin(
            revisions,
            and(eq(revisions.serverId, artifacts.serverId), eq(revisions.artifactId, artifacts.id))
        )
        .where(
            and(
                eq(artifacts.serverId, access.serverId),
                eq(artifacts.id, artifactId),
                isNull(artifacts.deletedAt),
                eq(revisions.state, 'ready'),
                revisionId
                    ? eq(revisions.id, revisionId)
                    : eq(revisions.id, artifacts.currentRevisionId)
            )
        )
        .limit(1);
    if (!row) {
        throw new ArtifactError('Artifact or revision was not found.', 404, 'NOT_FOUND');
    }
    return {
        metadata: artifactMetadata(row, origin, access.slug),
        objectKey: row.revision.objectKey,
    };
}

export async function listArtifacts(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    offset: number,
    artifactId?: string,
    filters?: Pick<ArtifactListInput, 'creator' | 'kind' | 'query'>
) {
    const access = await artifactAccess(db, actor);
    const rows = await db
        .select({ artifact: artifacts, revision: revisions })
        .from(artifacts)
        .innerJoin(
            revisions,
            and(eq(revisions.serverId, artifacts.serverId), eq(revisions.artifactId, artifacts.id))
        )
        .where(
            and(
                eq(artifacts.serverId, access.serverId),
                isNull(artifacts.deletedAt),
                eq(revisions.state, 'ready'),
                artifactFilters(filters),
                artifactId
                    ? eq(artifacts.id, artifactId)
                    : eq(revisions.id, artifacts.currentRevisionId)
            )
        )
        .orderBy(
            desc(artifactId ? revisions.revisionNumber : revisions.createdAt),
            desc(artifacts.id)
        )
        .limit(50)
        .offset(offset);
    if (artifactId) {
        await getArtifact(db, actor, origin, artifactId);
    }
    return rows.map((row) => artifactMetadata(row, origin, access.slug));
}

function artifactFilters(filters: Parameters<typeof listArtifacts>[5]) {
    if (!filters) {
        return undefined;
    }
    const image = ilike(revisions.contentType, 'image/%');
    const media = or(
        ilike(revisions.contentType, 'audio/%'),
        ilike(revisions.contentType, 'video/%')
    );
    const documents = or(
        ilike(revisions.contentType, 'text/%'),
        eq(revisions.contentType, 'application/pdf'),
        ilike(revisions.contentType, '%officedocument%'),
        eq(revisions.contentType, 'application/json')
    );
    const kind =
        filters.kind === 'images'
            ? image
            : filters.kind === 'media'
              ? media
              : filters.kind === 'documents'
                ? documents
                : filters.kind === 'other'
                  ? not(sql`(${image} or ${media} or ${documents})`)
                  : undefined;
    const pattern = `%${filters.query.replace(/[\\%_]/gu, '\\$&')}%`;
    return and(
        kind,
        artifactCreatorFilter(filters.creator),
        filters.query
            ? or(
                  ilike(revisions.title, pattern),
                  ilike(revisions.filename, pattern),
                  ilike(artifacts.name, pattern)
              )
            : undefined
    );
}

export async function downloadArtifact(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    storage: ArtifactStorage | null,
    artifactId: string,
    revisionId?: string,
    options: { save?: boolean } = {}
) {
    const result = await getArtifact(db, actor, origin, artifactId, revisionId);
    return {
        artifact: result.metadata,
        download_url: requireArtifactStorage(storage).downloadUrl(
            result.objectKey,
            options.save ? result.metadata.filename : undefined
        ),
        expires_at: new Date(Date.now() + 300_000).toISOString(),
    };
}

export function artifactMetadata(
    row: { artifact: typeof artifacts.$inferSelect; revision: typeof revisions.$inferSelect },
    origin: string,
    slug: string
): ArtifactMetadata {
    const stableUrl = new URL(`/s/${encodeURIComponent(slug)}/artifacts/${row.artifact.id}`, origin)
        .href;
    if (!row.revision.sha256) {
        throw new Error('Published artifact revision has no digest.');
    }
    return {
        artifact_id: row.artifact.id,
        content_type: row.revision.contentType,
        created_at: row.artifact.createdAt.toISOString(),
        creator: artifactCreator(row.artifact),
        filename: row.revision.filename,
        name: row.artifact.name,
        revision_id: row.revision.id,
        revision_number: row.revision.revisionNumber,
        sha256: row.revision.sha256,
        size_bytes: row.revision.byteSize,
        stable_url: stableUrl,
        title: row.revision.title,
        updated_at: row.revision.createdAt.toISOString(),
        version_url: `${stableUrl}?revision=${row.revision.id}`,
    };
}

export function artifactCreatorFilter(creator: ArtifactCreator | undefined) {
    if (!creator) {
        return undefined;
    }
    return creator.type === 'agent'
        ? eq(artifacts.creatorAgentId, creator.agent_id)
        : eq(artifacts.creatorUserId, creator.user_id);
}

/** `artifacts_creator_shape` guarantees exactly one creator column; any other shape is corrupt. */
export function artifactCreator(
    artifact: Pick<typeof artifacts.$inferSelect, 'creatorAgentId' | 'creatorUserId'>
): ArtifactCreator {
    if (artifact.creatorAgentId && !artifact.creatorUserId) {
        return { type: 'agent', agent_id: artifact.creatorAgentId };
    }
    if (artifact.creatorUserId && !artifact.creatorAgentId) {
        return { type: 'user', user_id: artifact.creatorUserId };
    }
    throw new Error('Artifact has no single creator.');
}
