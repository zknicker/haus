import { formatTaskKey, formatTaskTarget, type TaskState } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskKeysTable, tasksTable } from '../postgres/schema.ts';

type TaskChatReader = Pick<HausDatabase, 'select'>;
type TaskChatWriter = Pick<HausDatabase, 'select' | 'update'>;

export interface TaskChatRow {
    chatId: string;
    key: string;
    serverId: string;
    state: TaskState;
    taskId: string;
    version: number;
}

export async function findTaskByChatId(
    db: TaskChatReader,
    input: { chatId: string; serverId: string }
): Promise<TaskChatRow | null> {
    const [row] = await db
        .select({
            chatId: tasksTable.chatId,
            ledgerKey: taskKeysTable.key,
            number: tasksTable.number,
            serverId: tasksTable.serverId,
            state: tasksTable.state,
            taskId: tasksTable.id,
            version: tasksTable.version,
        })
        .from(tasksTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, tasksTable.serverId),
                eq(taskKeysTable.id, tasksTable.keyId)
            )
        )
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.chatId, input.chatId)))
        .limit(1);
    if (!row?.chatId) {
        return null;
    }
    return {
        chatId: row.chatId,
        key: formatTaskKey(row.ledgerKey, row.number),
        serverId: row.serverId,
        state: row.state,
        taskId: row.taskId,
        version: row.version,
    };
}

export async function taskTargetForChat(
    db: TaskChatReader,
    input: { chatId: string; serverId: string }
): Promise<string | null> {
    const task = await findTaskByChatId(db, input);
    return task ? formatTaskTarget(task.key) : null;
}

export async function reopenTaskOnPost(
    tx: TaskChatWriter,
    input: { chatId: string; serverId: string }
): Promise<TaskChatRow | null> {
    const [reopened] = await tx
        .update(tasksTable)
        .set({
            completedAt: null,
            state: 'open',
            updatedAt: sql`now()`,
            version: sql`${tasksTable.version} + 1`,
        })
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.chatId, input.chatId),
                inArray(tasksTable.state, ['done', 'canceled'])
            )
        )
        .returning({ taskId: tasksTable.id });
    if (!reopened) {
        return null;
    }
    return await findTaskByChatId(tx, input);
}
