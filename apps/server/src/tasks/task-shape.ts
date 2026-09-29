import type { MessageTask, TaskLabel } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageTaskLabelsTable, messageTasksTable, taskLabelsTable } from '../postgres/schema.ts';
import { threadChatIdForAnchor } from '../threads/thread-id.ts';
import { loadLiveTaskMessageIds } from './task-liveness.ts';
import { resolveTaskTier } from './task-tier.ts';

export type MessageTaskRow = typeof messageTasksTable.$inferSelect;

/** What a task row cannot answer alone: its lens and whether a run holds it. */
export interface TaskDerivation {
    labels: TaskLabel[];
    live: boolean;
    tier: MessageTask['tier'];
}

export async function findMessageTask(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageId: string
): Promise<MessageTask | null> {
    const [row] = await db
        .select()
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, serverId),
                eq(messageTasksTable.messageId, messageId)
            )
        )
        .limit(1);

    return row ? await toMessageTask(db, row) : null;
}

export async function listMessageTaskMap(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, MessageTask>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select()
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, serverId),
                inArray(messageTasksTable.messageId, messageIds)
            )
        );
    const tasks = await projectMessageTasks(db, serverId, rows);

    return new Map(tasks.map((task) => [task.messageId, task]));
}

export async function toMessageTask(
    db: Pick<HausDatabase, 'select'>,
    row: MessageTaskRow
): Promise<MessageTask> {
    const [task] = await projectMessageTasks(db, row.serverId, [row]);
    return task;
}

/**
 * Reads labels, tier evidence, and liveness once for a whole batch of rows.
 *
 * Sequential, never `Promise.all`: every task write projects its result before
 * committing, so `db` is usually the caller's transaction, and overlapping
 * reads on that one reserved connection wedge it — the transaction goes idle
 * still holding the Server row lock it took first, and every later durable
 * write queues behind it forever.
 */
export async function projectMessageTasks(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    rows: MessageTaskRow[],
    knownLabels?: Map<string, TaskLabel[]>
): Promise<MessageTask[]> {
    if (rows.length === 0) {
        return [];
    }
    const messageIds = rows.map((row) => row.messageId);
    const labels = knownLabels ?? (await listTaskLabelMap(db, serverId, messageIds));
    const live = await loadLiveTaskMessageIds(db, serverId, rows);
    return rows.map((row) =>
        toMessageTaskWithDerivation(row, {
            labels: labels.get(row.messageId) ?? [],
            live: live.has(row.messageId),
            tier: resolveTaskTier(row),
        })
    );
}

export function toMessageTaskWithDerivation(
    row: MessageTaskRow,
    derivation: TaskDerivation
): MessageTask {
    return {
        assigneeAgentId: row.assigneeAgentId,
        chatId: row.chatId,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        createdByAgentId: row.createdByAgentId,
        createdByUserId: row.createdByUserId,
        labels: derivation.labels,
        live: derivation.live,
        messageId: row.messageId,
        number: row.number,
        origin: row.origin,
        priority: row.priority,
        status: row.status,
        threadChatId: threadChatIdForAnchor(row.messageId),
        tier: derivation.tier,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    };
}

export async function listTaskLabelMap(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, TaskLabel[]>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            color: taskLabelsTable.color,
            id: taskLabelsTable.id,
            messageId: messageTaskLabelsTable.messageId,
            name: taskLabelsTable.name,
        })
        .from(messageTaskLabelsTable)
        .innerJoin(
            taskLabelsTable,
            and(
                eq(taskLabelsTable.serverId, messageTaskLabelsTable.serverId),
                eq(taskLabelsTable.id, messageTaskLabelsTable.labelId)
            )
        )
        .where(
            and(
                eq(messageTaskLabelsTable.serverId, serverId),
                inArray(messageTaskLabelsTable.messageId, messageIds)
            )
        )
        .orderBy(asc(messageTaskLabelsTable.messageId), asc(taskLabelsTable.name));
    const labels = new Map<string, TaskLabel[]>();
    for (const row of rows) {
        const current = labels.get(row.messageId) ?? [];
        current.push({ color: row.color, id: row.id, name: row.name });
        labels.set(row.messageId, current);
    }
    return labels;
}
