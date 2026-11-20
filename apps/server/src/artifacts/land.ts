import { artifactPathKey } from '@haus/api';
import { eq } from 'drizzle-orm';
import { driveAreaOfPath, writableDrivePath } from '../drive/areas.ts';
import { recordDriveChanges } from '../drive/changes.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { mergeOntoHead, storeMergedRevision } from './merge.ts';
import { lockLiveServer } from './move.ts';
import { liveArtifactAtPath, placeArtifactPath } from './path.ts';
import { takeNextNumber } from './revision-number.ts';
import { ArtifactError, type ArtifactStorage } from './storage.ts';
import type { ArtifactWriteExpectation } from './write-target.ts';

type Artifact = typeof artifacts.$inferSelect;
type Revision = typeof revisions.$inferSelect;

export async function landArtifactRevision(
    db: HausDatabase,
    access: ArtifactAccess,
    origin: string,
    storage: ArtifactStorage,
    landing: {
        artifactId: string;
        expect: ArtifactWriteExpectation;
        revision: Revision;
        uploaded: { sha256: string; size: number };
    }
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const artifact = await readArtifact(tx, landing.artifactId);
        const landed = await markUploaded(tx, artifact, landing.revision, landing.uploaded);
        const { expect } = landing;
        if (expect.kind === 'revive') {
            await writableDrivePath(tx, access, expect.path);
            await revive(tx, access, origin, artifact, landed, expect);
            return landed;
        }
        if (artifact.deletedAt) {
            throw new ArtifactError('File was deleted during publication.', 409, 'DELETED');
        }
        await writableDrivePath(tx, access, artifact.path);
        if (expect.kind === 'head' && artifact.currentRevisionId !== expect.base) {
            if (!expect.merges) {
                throw await revisionConflict(tx, access, origin, {
                    artifactId: artifact.id,
                    baseRevisionId: expect.base,
                    path: artifact.path,
                });
            }
            const merged = await staleHead(tx, access, origin, storage, {
                artifact,
                base: expect.base,
                landed,
            });
            await advanceHead(tx, access.serverId, artifact, merged);
            return merged;
        }
        await advanceHead(tx, access.serverId, artifact, landed);
        return landed;
    });
}

export async function readArtifact(tx: HausDatabase, artifactId: string) {
    const [artifact] = await tx
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, artifactId))
        .limit(1);
    if (!artifact) {
        throw new ArtifactError('File was deleted during publication.', 409, 'DELETED');
    }
    return artifact;
}

export async function markUploaded(
    tx: HausDatabase,
    artifact: Artifact,
    revision: Revision,
    uploaded: { sha256: string; size: number }
) {
    const [landed] = await tx
        .update(revisions)
        .set({
            byteSize: uploaded.size,
            parentRevisionId: artifact.currentRevisionId,
            requestSha256: uploaded.sha256,
            reservedBytes: uploaded.size,
            revisionNumber: await takeNextNumber(tx, artifact.id),
            sha256: uploaded.sha256,
            state: 'ready',
        })
        .where(eq(revisions.id, revision.id))
        .returning();
    if (!landed) {
        throw new Error('Landing revision did not return its row.');
    }
    return landed;
}

async function staleHead(
    tx: HausDatabase,
    access: ArtifactAccess,
    origin: string,
    storage: ArtifactStorage,
    write: { artifact: Artifact; base: string | null; landed: Revision }
) {
    const { artifact, base, landed } = write;
    const merge = base
        ? await mergeOntoHead(tx, storage, {
              artifact,
              base,
              incoming: landed,
              incomingSize: landed.byteSize,
          })
        : null;
    if (merge?.status !== 'merged') {
        throw await revisionConflict(tx, access, origin, {
            artifactId: artifact.id,
            baseRevisionId: base,
            path: artifact.path,
        });
    }
    return await storeMergedRevision(tx, storage, {
        artifact,
        bytes: merge.bytes,
        headNumber: merge.headNumber,
        revision: landed,
    });
}

export async function advanceHead(
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
    await reviveAt(tx, access.serverId, artifact, revision, expect.path);
}

export async function reviveAt(
    tx: HausDatabase,
    serverId: string,
    artifact: Artifact,
    revision: Revision,
    at: string
) {
    const path = await placeArtifactPath(tx, serverId, at);
    await tx
        .update(artifacts)
        .set({
            currentRevisionId: revision.id,
            deletedAt: null,
            deletedBy: null,
            path,
            pathKey: artifactPathKey(path),
        })
        .where(eq(artifacts.id, artifact.id));
    await recordPut(tx, serverId, { ...artifact, currentRevisionId: revision.id, path });
    return path;
}

export async function recordPut(
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
