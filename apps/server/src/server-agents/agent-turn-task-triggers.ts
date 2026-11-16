import { formatTaskKey } from '@haus/api';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, boardsTable, tasksTable } from '../postgres/schema.ts';
import { taskIdOfAssignmentKey } from '../tasks/task-assignment-envelope.ts';
import type { AgentTurnTaskTriggers, AgentTurnTriggerRecord } from './agent-turn-trigger.ts';

/**
 * Names the Task assignment runs on a page: each run's lead Task (the row its
 * trigger recorded) and how many more assignments rode the same run, in two reads.
 * A Task that no longer exists leaves its trigger unknown.
 */
export async function readAgentTurnTaskTriggers(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    records: readonly (AgentTurnTriggerRecord | null)[]
): Promise<AgentTurnTaskTriggers> {
    const leads = records.flatMap((record) => {
        const taskId =
            record?.source === 'task_assignment' ? taskIdOfAssignmentKey(record.workId) : null;
        return record && taskId ? [{ record, taskId }] : [];
    });
    if (leads.length === 0) {
        return new Map();
    }
    const tasks = await db
        .select({
            boardKey: boardsTable.key,
            id: tasksTable.id,
            number: tasksTable.number,
            title: tasksTable.title,
        })
        .from(tasksTable)
        .innerJoin(
            boardsTable,
            and(
                eq(boardsTable.serverId, tasksTable.serverId),
                eq(boardsTable.id, tasksTable.boardId)
            )
        )
        .where(
            and(
                eq(tasksTable.serverId, serverId),
                inArray(
                    tasksTable.id,
                    leads.map((lead) => lead.taskId)
                )
            )
        );
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const runIds = leads.flatMap(({ record }) => record.runId ?? []);
    const agentIds = [...new Set(leads.flatMap(({ record }) => record.agentId ?? []))];
    const rows =
        runIds.length === 0
            ? []
            : await db
                  .select({ assignments: count(), runId: agentInboxTable.runId })
                  .from(agentInboxTable)
                  .where(
                      and(
                          eq(agentInboxTable.serverId, serverId),
                          agentIds.length > 0
                              ? inArray(agentInboxTable.agentId, agentIds)
                              : undefined,
                          eq(agentInboxTable.source, 'task_assignment'),
                          inArray(agentInboxTable.runId, runIds)
                      )
                  )
                  .groupBy(agentInboxTable.runId);
    const assignmentsByRun = new Map(rows.map((row) => [row.runId, row.assignments]));
    return new Map(
        leads.flatMap(({ record, taskId }) => {
            const task = taskById.get(taskId);
            if (!task) {
                return [];
            }
            const more = (assignmentsByRun.get(record.runId ?? null) ?? 1) - 1;
            return [
                [
                    record.workId,
                    {
                        key: formatTaskKey(task.boardKey, task.number),
                        kind: 'task' as const,
                        ...(more > 0 ? { more } : {}),
                        taskId,
                        title: task.title,
                    },
                ] as const,
            ];
        })
    );
}
