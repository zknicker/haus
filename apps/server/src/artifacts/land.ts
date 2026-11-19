import { artifactPathKey } from '@haus/api';
import { eq } from 'drizzle-orm';
import { driveAreaOfPath } from '../drive/areas.ts';
import { recordDriveChanges } from '../drive/changes.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { lockLiveServer } from './move.ts';
import { liveArtifactAtPath, placeArtifactPath } from './path.ts';
import { ArtifactError } from './storage.ts';
import type { ArtifactWriteExpectation } from './write-target.ts';

type Artifact = typeof artifacts.$inferSelect;
type Revision = typeof revisions.$inferSelect;

export async function landArtifactRevision(
    db: HausDatabase,
    access: ArtifactAccess,
    origin: string,
    landing: {
        artifactId: string;
        expect: ArtifactWriteExpectation;
        revision: Revision;
        uploaded: { sha256: string; size: number };
    }
) {
    await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const [artifact] = await tx
            .select()
            .from(artifacts)
            .where(eq(artifacts.id, landing.artifactId))
            .limit(1);
        if (!artifact) {
            throw new ArtifactError('File was deleted during publication.', 409, 'DELETED');
        }
        await tx
            .update(revisions)
            .set({
                byteSize: landing.uploaded.size,
                parentRevisionId: artifact.currentRevisionId,
                requestSha256: landing.uploaded.sha256,
                reservedBytes: landing.uploaded.size,
                sha256: landing.uploaded.sha256,
                state: 'ready',
            })
            .where(eq(revisions.id, landing.revision.id));
        const { expect } = landing;
        if (expect.kind === 'revive') {
            await revive(tx, access, origin, artifact, landing.revision, expect);
            return;
        }
        if (artifact.deletedAt) {
            throw new ArtifactError('File was deleted during publication.', 409, 'DELETED');
        }
        if (expect.kind === 'head' && artifact.currentRevisionId !== expect.base) {
            throw await staleHead(tx, access, origin, artifact, expect.base);
        }
        await advanceHead(tx, access.serverId, artifact, landing.revision);
    });
}

async function staleHead(
    tx: HausDatabase,
    access: ArtifactAccess,
    origin: string,
    artifact: Artifact,
    base: string | null
) {
    return await revisionConflict(tx, access, origin, {
        artifactId: artifact.id,
        baseRevisionId: base,
        path: artifact.path,
    });
}

async function advanceHead(
    tx: HausDatabase,
    serverId: string,
    artifact: Artifact,
    revision: Revision
) {
    const [current] = artifact.currentRevisionId
        ? await tx
              .select({ number: revisions.revisionNumber })
              .from(revisions)
              .where(eq(revisions.id, artifact.currentRevisionId))
        : [];
    if (current && current.number >= revision.revisionNumber) {
        return;
    }
    await tx
        .update(artifacts)
        .set({ currentRevisionId: revision.id })
        .where(eq(artifacts.id, artifact.id));
    await recordPut(tx, serverId, { ...artifact, currentRevisionId: revision.id });
}

async function revive(
    tx: HausDatabase,
    access: ArtifactAccess,
    origin: string,
    artifact: Artifact,
    revision: Revision,
    expect: Extract<ArtifactWriteExpectation, { kind: 'revive' }>
) {
    const occupant = artifact.deletedAt
        ? await liveArtifactAtPath(tx, access.serverId, expect.path)
        : artifact;
    if (occupant) {
        throw await revisionConflict(tx, access, origin, {
            artifactId: occupant.id,
            baseRevisionId: expect.base,
            path: expect.path,
        });
    }
    const path = await placeArtifactPath(tx, access.serverId, expect.path);
    await tx
        .update(artifacts)
        .set({
            currentRevisionId: revision.id,
            deletedAt: null,
            path,
            pathKey: artifactPathKey(path),
        })
        .where(eq(artifacts.id, artifact.id));
    await recordPut(tx, access.serverId, { ...artifact, currentRevisionId: revision.id, path });
}

async function recordPut(
    tx: HausDatabase,
    serverId: string,
    artifact: Pick<Artifact, 'id' | 'path'> & { currentRevisionId: string }
) {
    const { area } = await driveAreaOfPath(tx, serverId, artifact.path);
    await recordDriveChanges(tx, serverId, [
        {
            area,
            artifactId: artifact.id,
            change: 'put',
            path: artifact.path,
            revisionId: artifact.currentRevisionId,
        },
    ]);
}
