import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskReportsTable, tasksTable } from '../postgres/schema.ts';
import { isCaptainDirectedRun, queueCrewReport, readLastTaskMessage } from './crew-report.ts';

export async function settleCrewTurn(
    tx: HausDatabase,
    input: {
        agentId: string;
        runId: string;
        serverId: string;
        status: 'completed' | 'failed' | 'interrupted';
    }
) {
    if (input.status === 'interrupted') {
        return null;
    }
    const [task] = await tx
        .select({
            agentId: tasksTable.agentId,
            captainId: tasksTable.captainId,
            chatId: tasksTable.chatId,
            id: tasksTable.id,
            serverId: tasksTable.serverId,
            shortId: tasksTable.shortId,
            title: tasksTable.title,
        })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!(task?.agentId && task.captainId && task.chatId)) {
        return null;
    }
    const crew = { ...task, agentId: task.agentId, captainId: task.captainId, chatId: task.chatId };
    const [reported] = await tx
        .select({ id: taskReportsTable.id })
        .from(taskReportsTable)
        .where(
            and(
                eq(taskReportsTable.serverId, task.serverId),
                eq(taskReportsTable.taskId, task.id),
                eq(taskReportsTable.runId, input.runId)
            )
        )
        .limit(1);
    if (reported) {
        return null;
    }
    const directed = await isCaptainDirectedRun(tx, crew, input.runId);
    if (!(directed || input.status === 'failed')) {
        return null;
    }
    return await queueCrewReport(tx, crew, {
        ask: null,
        outcome: input.status === 'failed' ? 'failed' : 'unreported',
        person: null,
        runId: input.runId,
        text: await readLastTaskMessage(tx, crew),
    });
}
