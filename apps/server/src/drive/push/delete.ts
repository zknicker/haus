import { drivePushDeleteInputSchema, type DrivePushOutcome } from '@haus/api';
import * as z from 'zod';
import { type ArtifactAccess, artifactAccess } from '../../artifacts/access.ts';
import { softDeleteArtifacts } from '../../artifacts/delete.ts';
import { lockLiveServer } from '../../artifacts/move.ts';
import { liveArtifactAtPath } from '../../artifacts/path.ts';
import type { ResolvedRunner } from '../../computers/runner-credentials.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { artifactUpdatedTopic } from '../../realtime/topics.ts';
import { writableDrivePath } from '../areas.ts';
import { headOf, isRefusal, requirePushPath, revisionOwner } from './outcomes.ts';
import type { DrivePushOptions } from './put.ts';
import {
    deleteRequest,
    type PushRequest,
    recordOutcome,
    recordRefusal,
    storedOutcome,
} from './replay.ts';
import { type DrivePush, openPush, requireOpenPush, requireRunSinceReset } from './session.ts';

const deleteBody = drivePushDeleteInputSchema.extend({ path: z.string().min(1).max(4096) });

export async function pushDelete(options: DrivePushOptions, runner: ResolvedRunner, body: unknown) {
    const input = deleteBody.parse(body);
    const { db } = options;
    const access = await artifactAccess(db, { kind: 'agent', runner });
    const request = deleteRequest(input);
    const stored = await storedOutcome(db, access, input.request_id, request);
    if (stored) {
        return stored.outcome;
    }
    const opened = await openPush(db, options.agentDelivery, access, input.push_id);
    options.wake(opened.wakes);
    const write = {
        base: input.base_revision_id,
        path: input.path,
        push: opened.push,
        request,
        requestId: input.request_id,
    };
    try {
        const result = await deleteIn(db, access, write);
        if (result.deletedArtifactId) {
            artifactUpdatedTopic.announce({
                artifactId: result.deletedArtifactId,
                serverId: access.serverId,
            });
        }
        return result.outcome;
    } catch (cause) {
        if (!isRefusal(cause)) {
            throw cause;
        }
        return await db.transaction(async (tx) => {
            await lockLiveServer(tx, access.serverId);
            await requireOpenPush(tx, access, opened.push.id);
            return await recordRefusal(tx, access, {
                cause,
                contentSha256: null,
                path: input.path,
                pushId: opened.push.id,
                request,
                requestId: input.request_id,
            });
        });
    }
}

async function deleteIn(
    db: HausDatabase,
    access: ArtifactAccess,
    write: {
        base: string;
        path: string;
        push: DrivePush;
        request: PushRequest;
        requestId: string;
    }
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        await requireOpenPush(tx, access, write.push.id);
        const prior = await storedOutcome(tx, access, write.requestId, write.request);
        if (prior) {
            return { deletedArtifactId: null, outcome: prior.outcome };
        }
        await requireRunSinceReset(tx, write.push);
        const placement = await writableDrivePath(tx, access, requirePushPath(write.path));
        const occupant = await liveArtifactAtPath(tx, access.serverId, placement.path);
        const current = occupant ? await headOf(tx, occupant) : null;
        const deletes = occupant?.currentRevisionId === write.base;
        if (occupant && deletes) {
            await softDeleteArtifacts(tx, access.serverId, [{ artifact: occupant, placement }]);
        }
        const keepsEdit =
            !deletes &&
            current &&
            (await revisionOwner(tx, access.serverId, write.base)) === occupant?.id;
        const outcome: DrivePushOutcome =
            keepsEdit && current
                ? { current, outcome: 'kept_edit', path: write.path, reason: 'edit_over_delete' }
                : { current: deletes ? null : current, outcome: 'deleted', path: write.path };
        return {
            deletedArtifactId: deletes ? (occupant?.id ?? null) : null,
            outcome: await recordOutcome(tx, access, {
                contentSha256: null,
                outcome,
                pushId: write.push.id,
                request: write.request,
                requestId: write.requestId,
            }),
        };
    });
}
