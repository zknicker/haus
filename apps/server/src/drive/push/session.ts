import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../../agent-delivery/delivery.ts';
import { readFlushSource } from '../../agent-machine/machine-change-store.ts';
import type { ArtifactAccess } from '../../artifacts/access.ts';
import { lockLiveServer } from '../../artifacts/move.ts';
import { ArtifactError } from '../../artifacts/storage.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    agentRunTriggersTable,
    agentsTable,
    drivePushesTable,
    workersTable,
    workerTurnsTable,
} from '../../postgres/schema.ts';
import { findTaskByChatId } from '../../tasks/task-chat.ts';
import { closePushIn, queueUnsentFiles } from './close.ts';

export type DrivePush = typeof drivePushesTable.$inferSelect;
export type PushAgentAccess = Pick<ArtifactAccess, 'agentId' | 'serverId' | 'worker'>;
export type ConflictDelivery = Pick<AgentDelivery, 'enqueue'>;

export async function openPush(
    db: HausDatabase,
    delivery: ConflictDelivery,
    access: PushAgentAccess,
    pushId: string
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        return await openPushIn(tx, delivery, access, pushId);
    });
}

export async function closePush(
    db: HausDatabase,
    delivery: ConflictDelivery,
    access: PushAgentAccess,
    pushId: string,
    unsent: readonly string[] = []
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const existing = await pushRow(tx, access, pushId);
        const opened = existing
            ? { push: existing, wakes: [] }
            : await openPushIn(tx, delivery, access, pushId);
        const closed = await closePushIn(tx, delivery, opened.push);
        const noted = await queueUnsentFiles(tx, delivery, opened.push, unsent);
        return {
            listed: closed.listed,
            wakes: [...opened.wakes, ...closed.wakes, ...noted],
        };
    });
}

export async function requireOpenPush(tx: HausDatabase, access: PushAgentAccess, pushId: string) {
    const push = await pushRow(tx, access, pushId);
    if (!push) {
        throw notDispatched(pushId);
    }
    if (push.closedAt) {
        throw pushClosed(pushId);
    }
    return push;
}

export async function requireRunSinceReset(tx: HausDatabase, push: DrivePush) {
    const [agent] = await tx
        .select({
            placementGeneration: agentsTable.placementGeneration,
            resetGeneration: agentsTable.resetGeneration,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, push.serverId), eq(agentsTable.id, push.agentId)))
        .limit(1);
    if (agent && agent.resetGeneration !== push.resetGeneration) {
        throw new ArtifactError(
            `A full reset replaced run \`${push.id}\`, so its push writes nothing.`,
            409,
            'AGENT_RESET'
        );
    }
    if (agent && push.workerId === null && agent.placementGeneration !== push.placementGeneration) {
        throw new ArtifactError(
            `Your Machine changed after run \`${push.id}\` started, so its push writes nothing. Its files stay in that Computer's folder.`,
            409,
            'AGENT_MOVED'
        );
    }
}

async function openPushIn(
    tx: HausDatabase,
    delivery: ConflictDelivery,
    access: PushAgentAccess,
    pushId: string
) {
    const existing = await pushRow(tx, access, pushId);
    if (existing?.closedAt) {
        throw pushClosed(pushId);
    }
    if (existing) {
        return { push: existing, wakes: [] };
    }
    const agentId = requireAgent(access);
    const source = await pushSource(tx, access, agentId, pushId);
    const earlier = await tx
        .select()
        .from(drivePushesTable)
        .where(
            and(
                eq(drivePushesTable.serverId, access.serverId),
                eq(drivePushesTable.agentId, agentId),
                access.worker
                    ? eq(drivePushesTable.workerId, access.worker.workerId)
                    : isNull(drivePushesTable.workerId),
                isNull(drivePushesTable.closedAt),
                ne(drivePushesTable.id, pushId)
            )
        );
    const wakes: { agentId: string; serverId: string }[] = [];
    for (const push of earlier) {
        wakes.push(...(await closePushIn(tx, delivery, push)).wakes);
    }
    const [push] = await tx
        .insert(drivePushesTable)
        .values({
            agentId,
            id: pushId,
            placementGeneration: source.placementGeneration,
            resetGeneration: source.resetGeneration,
            serverId: access.serverId,
            taskId: source.taskId,
            workerId: access.worker?.workerId ?? null,
        })
        .returning();
    if (!push) {
        throw new Error(`Push ${pushId} did not return its row.`);
    }
    return { push, wakes };
}

async function pushSource(
    tx: HausDatabase,
    access: PushAgentAccess,
    agentId: string,
    pushId: string
) {
    if (access.worker) {
        if (access.worker.turnId !== pushId) {
            throw notDispatched(pushId);
        }
        const [turn] = await tx
            .select({
                placementGeneration: agentsTable.placementGeneration,
                resetGeneration: sql<number>`coalesce(${workerTurnsTable.resetGeneration}, ${agentsTable.resetGeneration})`,
                taskId: workersTable.taskId,
            })
            .from(workerTurnsTable)
            .innerJoin(
                workersTable,
                and(
                    eq(workersTable.serverId, workerTurnsTable.serverId),
                    eq(workersTable.id, workerTurnsTable.workerId)
                )
            )
            .innerJoin(
                agentsTable,
                and(eq(agentsTable.serverId, workersTable.serverId), eq(agentsTable.id, agentId))
            )
            .where(
                and(
                    eq(workerTurnsTable.serverId, access.serverId),
                    eq(workerTurnsTable.id, pushId),
                    eq(workerTurnsTable.workerId, access.worker.workerId)
                )
            )
            .limit(1);
        if (!turn) {
            throw notDispatched(pushId);
        }
        return turn;
    }
    const [trigger] = await tx
        .select()
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, access.serverId),
                eq(agentRunTriggersTable.agentId, agentId),
                eq(agentRunTriggersTable.runId, pushId)
            )
        )
        .limit(1);
    if (!trigger) {
        const flush = await readFlushSource(tx, { agentId, pushId, serverId: access.serverId });
        if (!flush) {
            throw notDispatched(pushId);
        }
        return { ...flush, taskId: null };
    }
    return {
        placementGeneration: trigger.placementGeneration,
        resetGeneration: trigger.resetGeneration,
        taskId: await runTask(tx, trigger),
    };
}

async function runTask(tx: HausDatabase, trigger: typeof agentRunTriggersTable.$inferSelect) {
    if (!trigger.chatId) {
        return null;
    }
    const task = await findTaskByChatId(tx, { chatId: trigger.chatId, serverId: trigger.serverId });
    return task?.taskId ?? null;
}

async function pushRow(tx: HausDatabase, access: PushAgentAccess, pushId: string) {
    const [push] = await tx
        .select()
        .from(drivePushesTable)
        .where(and(eq(drivePushesTable.serverId, access.serverId), eq(drivePushesTable.id, pushId)))
        .limit(1);
    return push &&
        push.agentId === access.agentId &&
        push.workerId === (access.worker?.workerId ?? null)
        ? push
        : null;
}

function requireAgent(access: PushAgentAccess) {
    if (!access.agentId) {
        throw new ArtifactError('Only an Agent pushes Drive changes.', 403, 'FORBIDDEN');
    }
    return access.agentId;
}

function notDispatched(pushId: string) {
    return new ArtifactError(
        `No run \`${pushId}\` was dispatched to you, so it names no push.`,
        404,
        'NOT_FOUND'
    );
}

function pushClosed(pushId: string) {
    return new ArtifactError(
        `Push \`${pushId}\` is closed. Send this file in your next push.`,
        409,
        'PUSH_CLOSED'
    );
}
