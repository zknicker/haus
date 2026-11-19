import { artifactPathBasename, drivePushPutInputSchema } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import type { AgentDelivery } from '../../agent-delivery/delivery.ts';
import { type ArtifactAccess, artifactAccess } from '../../artifacts/access.ts';
import { lockLiveServer } from '../../artifacts/move.ts';
import { liveArtifactAtPath, placeArtifactPath } from '../../artifacts/path.ts';
import { abandonUpload, dropUploadedBytes } from '../../artifacts/publish.ts';
import { insertUploadingRevision, requireStorageBudget } from '../../artifacts/reserve.ts';
import {
    ArtifactError,
    type ArtifactStorage,
    artifactMaxBytes,
    requireArtifactStorage,
} from '../../artifacts/storage.ts';
import type { ArtifactThumbnails } from '../../artifacts/thumbnails.ts';
import { createArtifactAt, deletedArtifactOwning } from '../../artifacts/write-target.ts';
import type { ResolvedRunner } from '../../computers/runner-credentials.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { agentsTable, artifactRevisionsTable as revisions } from '../../postgres/schema.ts';
import { artifactUpdatedTopic } from '../../realtime/topics.ts';
import { writableDrivePath } from '../areas.ts';
import {
    isRefusal,
    pushRevisionRequestId,
    recordRefusal,
    requirePushPath,
    storedOutcome,
} from './outcomes.ts';
import { landPushPut } from './put-land.ts';
import { type DrivePush, openPush, requireOpenPush } from './session.ts';

export interface DrivePushOptions {
    agentDelivery: Pick<AgentDelivery, 'enqueue'>;
    budget: number;
    db: HausDatabase;
    storage: ArtifactStorage | null;
    thumbnails: ArtifactThumbnails | null;
    wake: (wakes: { agentId: string; serverId: string }[]) => void;
}

const putQuery = drivePushPutInputSchema.extend({
    path: z.string().min(1).max(4096),
});

export async function pushPut(
    options: DrivePushOptions,
    runner: ResolvedRunner,
    request: { contentType: string | undefined; query: unknown; stream: AsyncIterable<Uint8Array> }
) {
    const input = putQuery.parse(request.query);
    const { db } = options;
    const access = await artifactAccess(db, { kind: 'agent', runner });
    const stored = await storedOutcome(db, access, input.request_id);
    if (stored) {
        return stored;
    }
    const storage = requireArtifactStorage(options.storage);
    const opened = await openPush(db, options.agentDelivery, access, input.push_id);
    options.wake(opened.wakes);
    const { push } = opened;
    let reserved: typeof revisions.$inferSelect | null = null;
    try {
        requireRawContentType(request.contentType, input.content_type);
        const path = requirePushPath(input.path);
        const reservation = await reservePut(db, access, {
            base: input.base_revision_id ?? null,
            budget: options.budget,
            contentType: input.content_type,
            path,
            push,
            requestId: input.request_id,
        });
        if (reservation.stored) {
            return reservation.stored;
        }
        reserved = reservation.revision;
        const uploaded = await storage.upload(
            reserved.objectKey,
            request.stream,
            input.content_type
        );
        if (uploaded.size > artifactMaxBytes) {
            throw new ArtifactError('File exceeds the 256 MiB limit.', 413, 'SIZE_LIMIT');
        }
        const landed = await landPushPut(db, {
            access,
            base: input.base_revision_id ?? null,
            handle: await agentHandle(db, access),
            path,
            placed: reservation.placed,
            push,
            requestId: input.request_id,
            revision: reserved,
            storage,
            uploaded,
        });
        reserved = null;
        await settle(options, storage, access, landed);
        return landed.outcome;
    } catch (cause) {
        if (reserved) {
            await abandonUpload(db, storage, reserved, cause);
        }
        if (isRefusal(cause)) {
            return await refuse(db, access, {
                cause,
                path: input.path,
                pushId: push.id,
                requestId: input.request_id,
            });
        }
        throw cause;
    }
}

async function settle(
    options: DrivePushOptions,
    storage: ArtifactStorage,
    access: ArtifactAccess,
    landed: Awaited<ReturnType<typeof landPushPut>>
) {
    if (landed.discarded) {
        await dropUploadedBytes(options.db, storage, landed.discarded);
    }
    if (!landed.committed) {
        return;
    }
    const { artifactId, revision } = landed.committed;
    artifactUpdatedTopic.announce({ artifactId, serverId: access.serverId });
    void options.thumbnails?.ensure({
        byteSize: revision.byteSize,
        contentType: revision.contentType,
        id: revision.id,
        objectKey: revision.objectKey,
        thumbnailState: null,
    });
}

async function reservePut(
    db: HausDatabase,
    access: ArtifactAccess,
    write: {
        base: string | null;
        budget: number;
        contentType: string;
        path: string;
        push: DrivePush;
        requestId: string;
    }
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        await requireOpenPush(tx, access, write.push.id);
        const stored = await storedOutcome(tx, access, write.requestId);
        if (stored) {
            return { stored };
        }
        const { path: placed } = await writableDrivePath(tx, access, write.path);
        await requireStorageBudget(tx, access.serverId, write.budget);
        const requestId = pushRevisionRequestId(write.requestId);
        await releaseRequestId(tx, access, requestId);
        const revision = await insertUploadingRevision(tx, access, {
            artifact: await provisionalTarget(tx, access, placed, write.base),
            base: write.base,
            contentType: write.contentType,
            path: placed,
            requestId,
            taskId: write.push.taskId,
            title: artifactPathBasename(placed),
        });
        return { placed, revision, stored: null };
    });
}

async function provisionalTarget(
    tx: HausDatabase,
    access: ArtifactAccess,
    path: string,
    base: string | null
) {
    const occupant = await liveArtifactAtPath(tx, access.serverId, path);
    if (occupant) {
        return occupant;
    }
    await placeArtifactPath(tx, access.serverId, path);
    const deleted = base ? await deletedArtifactOwning(tx, access.serverId, base) : null;
    return deleted ?? (await createArtifactAt(tx, access, path));
}

async function releaseRequestId(tx: HausDatabase, access: ArtifactAccess, requestId: string) {
    const [prior] = await tx
        .select({ id: revisions.id, state: revisions.state })
        .from(revisions)
        .where(
            and(
                eq(revisions.serverId, access.serverId),
                eq(revisions.authorKey, access.authorKey),
                eq(revisions.requestId, requestId)
            )
        )
        .limit(1);
    if (prior?.state === 'uploading') {
        throw new ArtifactError(
            'This file is still uploading from an earlier attempt. Retry once it settles.',
            409,
            'UPLOAD_CONFLICT'
        );
    }
    if (prior) {
        await tx
            .update(revisions)
            .set({ requestId: `failed_${prior.id}` })
            .where(eq(revisions.id, prior.id));
    }
}

async function refuse(
    db: HausDatabase,
    access: ArtifactAccess,
    write: { cause: ArtifactError; path: string; pushId: string; requestId: string }
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        await requireOpenPush(tx, access, write.pushId);
        return await recordRefusal(tx, access, write);
    });
}

function requireRawContentType(header: string | undefined, contentType: string) {
    if (header && header !== 'application/octet-stream' && header !== contentType) {
        throw new ArtifactError(
            'Use application/octet-stream for raw pushes.',
            415,
            'CONTENT_TYPE'
        );
    }
}

async function agentHandle(db: HausDatabase, access: ArtifactAccess) {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(eq(agentsTable.serverId, access.serverId), eq(agentsTable.id, access.agentId ?? ''))
        )
        .limit(1);
    if (!agent) {
        throw new ArtifactError('Agent is no longer a Server member.', 403, 'FORBIDDEN');
    }
    return agent.handle;
}
