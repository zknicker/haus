import { createHash } from 'node:crypto';
import { artifactPathBasename, type DriveConflictReason, type DrivePushOutcome } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { ArtifactAccess } from '../../artifacts/access.ts';
import { advanceHead, markUploaded, readArtifact, reviveAt } from '../../artifacts/land.ts';
import { mergeOntoHead, storeMergedRevision, takeNextNumber } from '../../artifacts/merge.ts';
import { lockLiveServer } from '../../artifacts/move.ts';
import { liveArtifactAtPath } from '../../artifacts/path.ts';
import { releasePendingPath } from '../../artifacts/publish.ts';
import type { ArtifactStorage } from '../../artifacts/storage.ts';
import { createArtifactAt, deletedArtifactOwning } from '../../artifacts/write-target.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../../postgres/schema.ts';
import { writableDrivePath } from '../areas.ts';
import { freeCopyPath } from './copy-path.ts';
import { driveRevisionOf, revisionOwner } from './outcomes.ts';
import { type PushRequest, recordOutcome } from './replay.ts';
import { type DrivePush, requireOpenPush, requireRunSinceReset } from './session.ts';

type Artifact = typeof artifacts.$inferSelect;
type Revision = typeof revisions.$inferSelect;

export interface PushPutLanding {
    access: ArtifactAccess;
    base: string | null;
    handle: string;
    path: string;
    placed: string;
    push: DrivePush;
    request: PushRequest;
    requestId: string;
    revision: Revision;
    storage: ArtifactStorage;
    uploaded: { sha256: string; size: number };
}

interface Landed {
    outcome: DrivePushOutcome;
    committed: { artifactId: string; revision: Revision } | null;
}

export async function landPushPut(db: HausDatabase, landing: PushPutLanding) {
    return await db.transaction(async (tx) => {
        const { access, push } = landing;
        await lockLiveServer(tx, access.serverId);
        await requireOpenPush(tx, access, push.id);
        await requireRunSinceReset(tx, push);
        await writableDrivePath(tx, access, landing.placed);
        const provisional = await readArtifact(tx, landing.revision.artifactId);
        const landed = await markUploaded(tx, provisional, landing.revision, landing.uploaded);
        const result = await decide(tx, landing, landed);
        if (!result.committed) {
            await tx.update(revisions).set({ state: 'failed' }).where(eq(revisions.id, landed.id));
        }
        await releasePendingPath(tx, provisional.id);
        const outcome = await recordOutcome(tx, access, {
            contentSha256: landing.uploaded.sha256,
            outcome: result.outcome,
            pushId: push.id,
            request: landing.request,
            requestId: landing.requestId,
        });
        return {
            committed: result.committed,
            discarded: result.committed ? null : landed,
            outcome,
        };
    });
}

async function decide(tx: HausDatabase, landing: PushPutLanding, landed: Revision) {
    const { access, base, path } = landing;
    const occupant = await liveArtifactAtPath(tx, access.serverId, landing.placed);
    const head = occupant ? await headRevision(tx, occupant) : null;
    if (occupant && head) {
        const current = driveRevisionOf(occupant, head);
        if (head.sha256 === landed.sha256) {
            return unchanged(current, path);
        }
        if (base === head.id) {
            return await commitOnto(tx, landing, occupant, landed, 'committed');
        }
        if (!(base && (await revisionOwner(tx, access.serverId, base)) === occupant.id)) {
            return await keepBoth(tx, landing, landed, current, 'both_created');
        }
        const merge = await mergeOntoHead(tx, landing.storage, {
            artifact: occupant,
            base,
            incoming: landed,
            incomingSize: landed.byteSize,
        });
        if (merge.status === 'conflict') {
            return await keepBoth(tx, landing, landed, current, merge.reason);
        }
        if (sha256(merge.bytes) === head.sha256) {
            return unchanged(current, path);
        }
        const placed = await placeOn(tx, landed, occupant, base);
        const stored = await storeMergedRevision(tx, landing.storage, {
            artifact: occupant,
            bytes: merge.bytes,
            headNumber: head.revisionNumber,
            revision: placed,
        });
        await advanceHead(tx, access.serverId, occupant, stored);
        return {
            committed: { artifactId: occupant.id, revision: stored },
            outcome: { current: driveRevisionOf(occupant, stored), outcome: 'merged', path },
        } satisfies Landed;
    }
    if (occupant) {
        return occupant.id === landed.artifactId
            ? await commitOnto(tx, landing, occupant, landed, 'committed')
            : await keepBoth(tx, landing, landed, null, 'both_created');
    }
    const deleted = base ? await deletedArtifactOwning(tx, access.serverId, base) : null;
    if (deleted) {
        const placed = await placeOn(tx, landed, deleted, base);
        const revived = await reviveAt(tx, access.serverId, deleted, placed, landing.placed);
        return {
            committed: { artifactId: deleted.id, revision: placed },
            outcome: {
                current: driveRevisionOf({ id: deleted.id, path: revived }, placed),
                outcome: 'kept_edit',
                path,
                reason: 'edit_over_delete',
            },
        } satisfies Landed;
    }
    const created = await createArtifactAt(tx, access, landing.placed);
    return await commitOnto(tx, landing, created, landed, 'committed');
}

async function commitOnto(
    tx: HausDatabase,
    landing: PushPutLanding,
    artifact: Artifact,
    landed: Revision,
    outcome: 'committed'
) {
    const base = landing.base === artifact.currentRevisionId ? landing.base : null;
    const placed = await placeOn(tx, landed, artifact, base);
    await advanceHead(tx, landing.access.serverId, artifact, placed);
    return {
        committed: { artifactId: artifact.id, revision: placed },
        outcome: { current: driveRevisionOf(artifact, placed), outcome, path: landing.path },
    } satisfies Landed;
}

function unchanged(current: ReturnType<typeof driveRevisionOf>, path: string) {
    return { committed: null, outcome: { current, outcome: 'unchanged', path } } satisfies Landed;
}

async function keepBoth(
    tx: HausDatabase,
    landing: PushPutLanding,
    landed: Revision,
    current: ReturnType<typeof driveRevisionOf> | null,
    reason: DriveConflictReason
) {
    const { access } = landing;
    const copyPath = await freeCopyPath(tx, access.serverId, landing.placed, landing.handle);
    const copy = await createArtifactAt(tx, access, copyPath);
    const placed = await placeOn(tx, landed, copy, null);
    await advanceHead(tx, access.serverId, copy, placed);
    return {
        committed: { artifactId: copy.id, revision: placed },
        outcome: {
            copy: driveRevisionOf(copy, placed),
            current,
            outcome: 'kept_both',
            path: landing.path,
            reason,
        },
    } satisfies Landed;
}

async function placeOn(
    tx: HausDatabase,
    revision: Revision,
    artifact: Artifact,
    base: string | null
) {
    const head = await headRevision(tx, artifact);
    const keepsNumber =
        revision.artifactId === artifact.id &&
        revision.revisionNumber > (head?.revisionNumber ?? 0);
    const name = artifactPathBasename(artifact.path);
    const [placed] = await tx
        .update(revisions)
        .set({
            artifactId: artifact.id,
            baseRevisionId: base,
            filename: name,
            parentRevisionId: artifact.currentRevisionId,
            revisionNumber: keepsNumber
                ? revision.revisionNumber
                : await takeNextNumber(tx, artifact.id),
            title: name,
        })
        .where(eq(revisions.id, revision.id))
        .returning();
    if (!placed) {
        throw new Error(`Revision ${revision.id} vanished under the Server lock.`);
    }
    return placed;
}

async function headRevision(tx: HausDatabase, artifact: Artifact) {
    if (!artifact.currentRevisionId) {
        return null;
    }
    const [row] = await tx
        .select()
        .from(revisions)
        .where(eq(revisions.id, artifact.currentRevisionId))
        .limit(1);
    return row ?? null;
}

function sha256(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}
