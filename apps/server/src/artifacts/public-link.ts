import { randomBytes } from 'node:crypto';
import type { ArtifactPublicLink } from '@haus/api';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts } from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactAccess, type ArtifactActor, artifactAccess } from './access.ts';
import { ArtifactError } from './storage.ts';

/**
 * Public links (specs/artifact-public-links.md). Any reader may create a file's link; the link's
 * creator or a human Owner/Admin may disable it. Enabling reuses a live token; disabling clears
 * it, so re-enabling always issues a new one.
 */
export async function shareArtifact(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    artifactId: string
): Promise<ArtifactPublicLink> {
    const access = await artifactAccess(db, actor);
    const [created] = await db
        .update(artifacts)
        .set({
            publicLinkCreatedAt: new Date(),
            publicLinkCreatorAgentId: access.agentId,
            publicLinkCreatorUserId: access.agentId ? null : access.userId,
            publicToken: randomBytes(24).toString('base64url'),
        })
        .where(and(liveArtifact(access, artifactId), isNull(artifacts.publicToken)))
        .returning();
    if (created) {
        artifactUpdatedTopic.announce({ artifactId, serverId: access.serverId });
        return publicLinkView(created, access, origin);
    }
    // A live link wins; one disabled between the two statements gets a fresh token.
    return (
        (await artifactPublicLink(db, actor, origin, artifactId)) ??
        (await shareArtifact(db, actor, origin, artifactId))
    );
}

/** Disables a file's public link; disabling a file without one succeeds. */
export async function unshareArtifact(
    db: HausDatabase,
    actor: ArtifactActor,
    artifactId: string
): Promise<void> {
    const access = await artifactAccess(db, actor);
    const row = await requireLiveArtifact(db, access, artifactId);
    if (!row.publicToken) {
        return;
    }
    if (!canDisable(row, access)) {
        throw new ArtifactError(
            'Only whoever created the public link or a human Owner/Admin can disable it.',
            403,
            'FORBIDDEN'
        );
    }
    const [cleared] = await db
        .update(artifacts)
        .set({
            publicLinkCreatedAt: null,
            publicLinkCreatorAgentId: null,
            publicLinkCreatorUserId: null,
            publicToken: null,
        })
        .where(and(liveArtifact(access, artifactId), eq(artifacts.publicToken, row.publicToken)))
        .returning({ id: artifacts.id });
    if (cleared) {
        artifactUpdatedTopic.announce({ artifactId, serverId: access.serverId });
    }
}

/** One readable file's public link, or null when it has none. */
export async function artifactPublicLink(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    artifactId: string
): Promise<ArtifactPublicLink | null> {
    const access = await artifactAccess(db, actor);
    const row = await requireLiveArtifact(db, access, artifactId);
    return row.publicToken ? publicLinkView(row, access, origin) : null;
}

/** The public links among a page of files, keyed by artifact id. */
export async function artifactPublicLinks(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    artifactIds: readonly string[]
): Promise<Record<string, ArtifactPublicLink>> {
    if (artifactIds.length === 0) {
        return {};
    }
    const access = await artifactAccess(db, actor);
    const rows = await db
        .select()
        .from(artifacts)
        .where(
            and(
                eq(artifacts.serverId, access.serverId),
                inArray(artifacts.id, [...artifactIds]),
                isNull(artifacts.deletedAt),
                isNotNull(artifacts.publicToken)
            )
        );
    return Object.fromEntries(rows.map((row) => [row.id, publicLinkView(row, access, origin)]));
}

export function artifactPublicUrl(origin: string, token: string) {
    return new URL(`/f/${token}`, origin).href;
}

type ArtifactRow = typeof artifacts.$inferSelect;

function liveArtifact(access: ArtifactAccess, artifactId: string) {
    return and(
        eq(artifacts.serverId, access.serverId),
        eq(artifacts.id, artifactId),
        isNull(artifacts.deletedAt)
    );
}

async function requireLiveArtifact(db: HausDatabase, access: ArtifactAccess, artifactId: string) {
    const [row] = await db
        .select()
        .from(artifacts)
        .where(liveArtifact(access, artifactId))
        .limit(1);
    if (!row) {
        throw new ArtifactError('File was not found.', 404, 'NOT_FOUND');
    }
    return row;
}

function publicLinkView(row: ArtifactRow, access: ArtifactAccess, origin: string) {
    if (!(row.publicToken && row.publicLinkCreatedAt)) {
        throw new Error('Artifact has no public link.');
    }
    return {
        can_disable: canDisable(row, access),
        created_at: row.publicLinkCreatedAt.toISOString(),
        creator: publicLinkCreator(row),
        url: artifactPublicUrl(origin, row.publicToken),
    };
}

function canDisable(row: ArtifactRow, access: ArtifactAccess) {
    if (access.isAdmin) {
        return true;
    }
    if (access.agentId !== null) {
        return row.publicLinkCreatorAgentId === access.agentId;
    }
    return access.userId !== null && row.publicLinkCreatorUserId === access.userId;
}

/** `artifacts_public_link_shape` guarantees exactly one creator while a link is live. */
function publicLinkCreator(row: ArtifactRow): ArtifactPublicLink['creator'] {
    if (row.publicLinkCreatorAgentId) {
        return { type: 'agent', agent_id: row.publicLinkCreatorAgentId };
    }
    if (row.publicLinkCreatorUserId) {
        return { type: 'user', user_id: row.publicLinkCreatorUserId };
    }
    throw new Error('Public link has no creator.');
}
