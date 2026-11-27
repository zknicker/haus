import { and, eq, isNull, ne } from 'drizzle-orm';
import type { AgentDelivery } from '../../agent-delivery/delivery.ts';
import { readFlushSource } from '../../agent-machine/machine-change-store.ts';
import type { ArtifactAccess } from '../../artifacts/access.ts';
import { lockLiveServer } from '../../artifacts/move.ts';
import { ArtifactError } from '../../artifacts/storage.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { agentRunTriggersTable, agentsTable, drivePushesTable } from '../../postgres/schema.ts';
import { findTaskByChatId } from '../../tasks/task-chat.ts';
import { closePushIn } from './close.ts';

export type DrivePush = typeof drivePushesTable.$inferSelect;
export type PushAgentAccess = Pick<ArtifactAccess, 'agentId' | 'serverId'>;
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
    pushId: string
) {
    return await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const existing = await pushRow(tx, access, pushId);
        const opened = existing
            ? { push: existing, wakes: [] }
            : await openPushIn(tx, delivery, access, pushId);
        const closed = await closePushIn(tx, delivery, opened.push);
        return { listed: closed.listed, wakes: [...opened.wakes, ...closed.wakes] };
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
    if (agent && agent.placementGeneration !== push.placementGeneration) {
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
    const source = await pushSource(tx, access.serverId, agentId, pushId);
    const earlier = await tx
        .select()
        .from(drivePushesTable)
        .where(
            and(
                eq(drivePushesTable.serverId, access.serverId),
                eq(drivePushesTable.agentId, agentId),
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
        })
        .returning();
    if (!push) {
        throw new Error(`Push ${pushId} did not return its row.`);
    }
    return { push, wakes };
}

async function pushSource(tx: HausDatabase, serverId: string, agentId: string, pushId: string) {
    const [trigger] = await tx
        .select()
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, serverId),
                eq(agentRunTriggersTable.agentId, agentId),
                eq(agentRunTriggersTable.runId, pushId)
            )
        )
        .limit(1);
    if (!trigger) {
        const flush = await readFlushSource(tx, { agentId, pushId, serverId });
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
    return push && push.agentId === access.agentId ? push : null;
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
