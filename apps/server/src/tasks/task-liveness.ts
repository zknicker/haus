import { and, eq, inArray, ne, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../postgres/schema.ts';
import { type TaskWorkThreadRow, taskWorkThreadChatId } from './task-work-thread.ts';

/** The task columns liveness reads. */
export interface TaskLivenessRow extends TaskWorkThreadRow {
    assigneeAgentId: string | null;
}

/**
 * A task is live while its assignee Agent's one in-flight run holds an inbox
 * row anchored on the task's own message or on its work Thread (the Thread a
 * Thread task sits in, which several tasks can share) — attached to the
 * run by a pull, or offered to it as a notice in the run's own Chat. Liveness
 * is volatile execution state derived at read time, never a stored task
 * column; the run's start and its settlement both emit `task.updated`, so the
 * App learns about it the same way it learns about every other task change.
 */
export async function loadLiveTaskMessageIds(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    rows: TaskLivenessRow[]
): Promise<Set<string>> {
    const assigned = rows.filter((row) => row.assigneeAgentId !== null);
    if (assigned.length === 0) {
        return new Set();
    }
    const tasksByKey = new Map<string, string[]>();
    const hold = (key: string, messageId: string) => {
        tasksByKey.set(key, [...(tasksByKey.get(key) ?? []), messageId]);
    };
    for (const row of assigned) {
        hold(`${row.assigneeAgentId} ${row.messageId}`, row.messageId);
        hold(`${row.assigneeAgentId} ${taskWorkThreadChatId(row)}`, row.messageId);
    }
    const agentIds = [...new Set(assigned.map((row) => row.assigneeAgentId as string))];
    const served = await db
        .select({
            agentId: agentInboxTable.agentId,
            chatId: agentInboxTable.chatId,
            dedupeKey: agentInboxTable.dedupeKey,
        })
        .from(agentInboxTable)
        .innerJoin(
            agentDeliveryTable,
            and(
                eq(agentDeliveryTable.agentId, agentInboxTable.agentId),
                or(
                    eq(agentDeliveryTable.activeRunId, agentInboxTable.runId),
                    and(
                        eq(agentDeliveryTable.activeRunId, agentInboxTable.noticeRunId),
                        eq(agentDeliveryTable.activeRunChatId, agentInboxTable.chatId)
                    )
                )
            )
        )
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                inArray(agentInboxTable.agentId, agentIds),
                ne(agentInboxTable.state, 'seen')
            )
        );
    const live = new Set<string>();
    for (const row of served) {
        for (const key of [`${row.agentId} ${row.dedupeKey}`, `${row.agentId} ${row.chatId}`]) {
            for (const messageId of tasksByKey.get(key) ?? []) {
                live.add(messageId);
            }
        }
    }
    return live;
}
