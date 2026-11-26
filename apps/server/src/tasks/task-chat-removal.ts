import { and, eq, inArray, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
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
        .select({ id: tasksTable.id, version: tasksTable.version })
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
