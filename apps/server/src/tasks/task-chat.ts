import { formatTaskTarget } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';

type TaskChatReader = Pick<HausDatabase, 'select'>;

export interface TaskChatRow {
    archivedAt: Date | null;
    chatId: string;
    serverId: string;
    shortId: string;
    taskId: string;
    version: number;
}

export async function findTaskByChatId(
    db: TaskChatReader,
    input: { chatId: string; serverId: string }
): Promise<TaskChatRow | null> {
    const [row] = await db
        .select({
            archivedAt: tasksTable.archivedAt,
            chatId: tasksTable.chatId,
            serverId: tasksTable.serverId,
            shortId: tasksTable.shortId,
            taskId: tasksTable.id,
            version: tasksTable.version,
        })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.chatId, input.chatId)))
        .limit(1);
    if (!row?.chatId) {
        return null;
    }
    return { ...row, chatId: row.chatId };
}

export async function taskTargetForChat(
    db: TaskChatReader,
    input: { chatId: string; serverId: string }
): Promise<string | null> {
    const task = await findTaskByChatId(db, input);
    return task ? formatTaskTarget(task.shortId) : null;
}
