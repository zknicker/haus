import { type AnyColumn, and, eq, inArray, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    agentRunnerCredentialsTable,
    agentsTable,
    tasksTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { closeDeletedTaskWorkers } from '../workers/close-deleted-task-workers.ts';
import type { WorkerFrame } from '../workers/worker-effects.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

const nothingDeleted = { events: [] as PreparedRealtimeEvent[], workerFrames: [] as WorkerFrame[] };

export async function deleteTasksOfRemovedChats(
    tx: Tx,
    input: { chatIds: readonly string[]; serverId: string }
) {
    if (input.chatIds.length === 0) {
        return nothingDeleted;
    }
    const tasks = await tx
        .select({ agentId: tasksTable.agentId, id: tasksTable.id, version: tasksTable.version })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                or(
                    inArray(tasksTable.projectId, [...input.chatIds]),
                    inArray(tasksTable.chatId, [...input.chatIds])
                )
            )
        );
    if (tasks.length === 0) {
        return nothingDeleted;
    }
    const taskIds = tasks.map(({ id }) => id);
    const workerFrames = await closeDeletedTaskWorkers(tx, { serverId: input.serverId, taskIds });
    await tx
        .delete(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), inArray(tasksTable.id, taskIds)));
    await retireTaskAgents(tx, {
        agentIds: tasks.flatMap(({ agentId }) => (agentId ? [agentId] : [])),
        serverId: input.serverId,
    });
    const events = tasks.map((task) =>
        prepareTaskUpdatedEvent({
            chatId: null,
            id: task.id,
            serverId: input.serverId,
            version: task.version,
        })
    );
    return { events, workerFrames };
}

/** A deleted Task's hidden agent goes with it: retired, with no queue or credential left. */
async function retireTaskAgents(tx: Tx, input: { agentIds: string[]; serverId: string }) {
    if (input.agentIds.length === 0) {
        return;
    }
    const scoped = <Table extends { agentId: AnyColumn; serverId: AnyColumn }>(table: Table) =>
        and(eq(table.serverId, input.serverId), inArray(table.agentId, input.agentIds));
    await tx.delete(agentRunnerCredentialsTable).where(scoped(agentRunnerCredentialsTable));
    await tx.delete(agentInboxTable).where(scoped(agentInboxTable));
    await tx.delete(agentDeliveryTable).where(scoped(agentDeliveryTable));
    await tx
        .update(agentsTable)
        .set({ retiredAt: sql`now()` })
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.kind, 'task'),
                inArray(agentsTable.id, input.agentIds)
            )
        );
}
