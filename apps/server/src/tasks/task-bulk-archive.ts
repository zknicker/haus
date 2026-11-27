import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import type { TaskActor } from './task-actor.ts';
import { archiveLockedTask } from './task-archive.ts';
import { lockTask } from './task-read.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export function archiveCrew(
    tx: Tx,
    agentDelivery: AgentDelivery,
    input: { actor: TaskActor; captainId: string; serverId: string }
) {
    return archiveActiveTasks(tx, agentDelivery, input, eq(tasksTable.captainId, input.captainId));
}

export function archiveProjectTasks(
    tx: Tx,
    agentDelivery: AgentDelivery,
    input: { actor: TaskActor; projectId: string; serverId: string }
) {
    return archiveActiveTasks(tx, agentDelivery, input, eq(tasksTable.projectId, input.projectId));
}

export function archiveMachineTasks(
    tx: Tx,
    agentDelivery: AgentDelivery,
    input: { actor: TaskActor; computerId: string; serverId: string }
) {
    return archiveActiveTasks(
        tx,
        agentDelivery,
        input,
        eq(tasksTable.computerId, input.computerId)
    );
}

async function archiveActiveTasks(
    tx: Tx,
    agentDelivery: AgentDelivery,
    input: { actor: TaskActor; serverId: string },
    where: SQL
) {
    const active = await tx
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), isNull(tasksTable.archivedAt), where));
    const archived = [];
    for (const { id } of active) {
        const current = await lockTask(tx, input.serverId, id);
        archived.push(await archiveLockedTask(tx, input.actor, agentDelivery, current));
    }
    return {
        events: archived.flatMap((result) => result.events),
        sessions: archived.flatMap((result) => result.sessions ?? []),
        wakes: archived.flatMap((result) => result.wakes),
    };
}
