import { formatTaskKey, formatTaskTarget, type TaskState } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskKeysTable, tasksTable } from '../postgres/schema.ts';

type TaskChatReader = Pick<HausDatabase, 'select'>;
type TaskChatWriter = Pick<HausDatabase, 'select' | 'update'>;

/** The Task whose own Chat a conversation is (ADR 0052), as Chat-keyed code needs it. */
export interface TaskChatRow {
    chatId: string;
    /** `SEC-12`: the ledger entry's key and the Task's number. */
    key: string;
    serverId: string;
    state: TaskState;
    taskId: string;
    version: number;
}

/** The Task a `task` Chat belongs to, or null when the Chat is no Task's. */
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

/** A `task` Chat's send target, `task:SEC-12`; null when the Chat is no Task's. */
export async function taskTargetForChat(
    db: TaskChatReader,
    input: { chatId: string; serverId: string }
): Promise<string | null> {
    const task = await findTaskByChatId(db, input);
    return task ? formatTaskTarget(task.key) : null;
}

/**
 * Posting in a done or canceled Task reopens it (ADR 0052 decision 13). Call it
 * inside the send's transaction. Returns the reopened Task, so the caller can
 * announce `task.updated` after commit, or null when nothing changed: the Chat
 * is no Task's, or its Task is already todo or open. Reopening never restores
 * reminders that closing canceled (decision 16).
 */
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
