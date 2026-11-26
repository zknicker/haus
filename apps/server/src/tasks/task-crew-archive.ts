import { and, eq, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import type { TaskActor } from './task-actor.ts';
import { archiveLockedTask } from './task-archive.ts';
import { lockTask } from './task-read.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export async function archiveCrew(
    tx: Tx,
    agentDelivery: AgentDelivery,
    input: { actor: TaskActor; captainId: string; serverId: string }
) {
    const crew = await tx
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.captainId, input.captainId),
                isNull(tasksTable.archivedAt)
            )
        );
    const archived = [];
    for (const { id } of crew) {
        const current = await lockTask(tx, input.serverId, id);
        archived.push(await archiveLockedTask(tx, input.actor, agentDelivery, current));
    }
    return {
        events: archived.flatMap((result) => result.events),
        sessions: archived.flatMap((result) => result.sessions ?? []),
        wakes: archived.flatMap((result) => result.wakes),
        workerFrames: archived.flatMap((result) => result.workerFrames ?? []),
    };
}
