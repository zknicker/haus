import { and, eq, inArray, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkTable, tasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { retireTaskAssignments } from './task-agent-delivery.ts';
import { prepareTaskUpdatedEvent } from './task-events.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export async function deleteTasksOfRemovedChats(
    tx: Tx,
    input: { chatIds: readonly string[]; serverId: string }
): Promise<PreparedRealtimeEvent[]> {
    if (input.chatIds.length === 0) {
        return [];
    }
    const tasks = await tx
        .select({
            assigneeAgentId: tasksTable.assigneeAgentId,
            id: tasksTable.id,
            version: tasksTable.version,
        })
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
        return [];
    }
    const taskIds = tasks.map(({ id }) => id);
    await tx
        .update(cloudAgentWorkTable)
        .set({ taskId: null })
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                inArray(cloudAgentWorkTable.taskId, taskIds)
            )
        );
    for (const task of tasks) {
        if (task.assigneeAgentId) {
            await retireTaskAssignments(tx, {
                agentId: task.assigneeAgentId,
                serverId: input.serverId,
                taskId: task.id,
            });
        }
    }
    await tx
        .delete(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), inArray(tasksTable.id, taskIds)));
    return tasks.map((task) =>
        prepareTaskUpdatedEvent({
            chatId: null,
            id: task.id,
            serverId: input.serverId,
            version: task.version,
        })
    );
}
