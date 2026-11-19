import { type ArtifactPublishInput, artifactPathKey } from '@haus/api';
import { and, eq, isNotNull } from 'drizzle-orm';
import { writableDrivePath } from '../drive/areas.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { liveArtifactAtPath, placeArtifactPath } from './path.ts';

export type ArtifactWriteExpectation =
    | { kind: 'replace' }
    | { kind: 'head'; base: string | null }
    | { kind: 'revive'; base: string; path: string };

export interface ArtifactWriteTarget {
    artifact: typeof artifacts.$inferSelect;
    expect: ArtifactWriteExpectation;
    path: string;
}

export async function writeTarget(
    tx: HausDatabase,
    access: ArtifactAccess,
    input: ArtifactPublishInput,
    origin: string
) {
    const { path } = await writableDrivePath(tx, access, input.path);
    const base = input.base_revision_id ?? null;
    const occupant = await liveArtifactAtPath(tx, access.serverId, path);
    if (occupant) {
        if (input.replace) {
            return target(occupant, { kind: 'replace' }, occupant.path);
        }
        if (base && (await isMergeBase(tx, occupant, base))) {
            return target(occupant, { base, kind: 'head' }, occupant.path);
        }
        throw await revisionConflict(tx, access, origin, {
            artifactId: occupant.id,
            baseRevisionId: base,
            path,
        });
    }
    if (base) {
        const deleted = await deletedArtifactOwning(tx, access.serverId, base);
        if (!deleted) {
            throw await revisionConflict(tx, access, origin, {
                artifactId: null,
                baseRevisionId: base,
                path,
            });
        }
        const placed = await placeArtifactPath(tx, access.serverId, path);
        return target(deleted, { base, kind: 'revive', path: placed }, placed);
    }
    const artifact = await createArtifactAt(tx, access, path);
    return target(
        artifact,
        input.replace ? { kind: 'replace' } : { base: null, kind: 'head' },
        artifact.path
    );
}

export async function createArtifactAt(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'agentId' | 'serverId' | 'userId'>,
    path: string
) {
    const placed = await placeArtifactPath(tx, access.serverId, path);
    const [artifact] = await tx
        .insert(artifacts)
        .values({
            creatorAgentId: access.agentId,
            creatorUserId: access.userId,
            id: createOpaqueId('art'),
            path: placed,
            pathKey: artifactPathKey(placed),
            serverId: access.serverId,
        })
        .returning();
    if (!artifact) {
        throw new Error('Artifact reservation did not return its row.');
    }
    return artifact;
}

function target(
    artifact: typeof artifacts.$inferSelect,
    expect: ArtifactWriteExpectation,
    path: string
) {
    return { artifact, expect, path } satisfies ArtifactWriteTarget;
}

async function isMergeBase(
    tx: HausDatabase,
    artifact: typeof artifacts.$inferSelect,
    base: string
) {
    if (!artifact.currentRevisionId) {
        return false;
    }
    if (base === artifact.currentRevisionId) {
        return true;
    }
    const [revision] = await tx
        .select({ id: revisions.id })
        .from(revisions)
        .where(
            and(
                eq(revisions.serverId, artifact.serverId),
                eq(revisions.artifactId, artifact.id),
                eq(revisions.id, base),
                eq(revisions.state, 'ready')
            )
        )
        .limit(1);
    return Boolean(revision);
}

export async function deletedArtifactOwning(
    tx: HausDatabase,
    serverId: string,
    revisionId: string
) {
    const [row] = await tx
        .select({ artifact: artifacts })
        .from(revisions)
        .innerJoin(
            artifacts,
            and(eq(artifacts.serverId, revisions.serverId), eq(artifacts.id, revisions.artifactId))
        )
        .where(
            and(
                eq(revisions.serverId, serverId),
                eq(revisions.id, revisionId),
                isNotNull(artifacts.deletedAt),
                isNotNull(artifacts.currentRevisionId)
            )
        )
        .limit(1);
    return row?.artifact;
}
