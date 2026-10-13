import { type ArtifactCreator, type ArtifactMetadata, artifactPathBasename } from '@haus/api';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { liveArtifactAtPath } from './path.ts';
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

/** The live file at a drive path, by the same case- and normalization-folded key writes use. */
export async function getArtifactAtPath(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    path: string
) {
    const access = await artifactAccess(db, actor);
    const artifact = await liveArtifactAtPath(db, access.serverId, path);
    const metadata = artifact
        ? await currentArtifactMetadata(db, access.serverId, artifact.id, origin, access.slug)
        : null;
    if (!metadata) {
        throw new ArtifactError(`Nothing lives at \`${path}\`.`, 404, 'NOT_FOUND');
    }
    return metadata;
}

/** Every ready revision of one artifact, newest revision number first, 50 per page. */
export async function listArtifactVersions(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    artifactId: string,
    offset: number
) {
    await getArtifact(db, actor, origin, artifactId);
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
                eq(artifacts.id, artifactId),
                isNull(artifacts.deletedAt),
                eq(revisions.state, 'ready')
            )
        )
        .orderBy(desc(revisions.revisionNumber))
        .limit(50)
        .offset(offset);
    return rows.map((row) => artifactMetadata(row, origin, access.slug));
}

/** The live head of an artifact, or null while its first publish is still in flight. */
export async function currentArtifactMetadata(
    db: HausDatabase,
    serverId: string,
    artifactId: string,
    origin: string,
    slug: string
) {
    const [row] = await db
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
                eq(artifacts.serverId, serverId),
                eq(artifacts.id, artifactId),
                isNull(artifacts.deletedAt),
                eq(revisions.state, 'ready')
            )
        )
        .limit(1);
    return row ? artifactMetadata(row, origin, slug) : null;
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
        filename: artifactPathBasename(row.artifact.path),
        path: row.artifact.path,
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
