import { parseTaskKey, TASK_TARGET_PATTERN } from '@haus/api';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, taskKeysTable, tasksTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export function parseTaskTarget(target: string): string | null {
    return TASK_TARGET_PATTERN.exec(target)?.[1] ?? null;
}

export async function resolveTaskTargetChat(
    db: Reader,
    runner: Pick<ResolvedRunner, 'serverId'>,
    taskKey: string
): Promise<{ chatId: string; taskId: string } | null> {
    const parsed = parseTaskKey(taskKey);
    if (!parsed) {
        return null;
    }
    const rows = await db
        .select({ chatId: tasksTable.chatId, taskId: tasksTable.id })
        .from(tasksTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, tasksTable.serverId),
                eq(taskKeysTable.id, tasksTable.keyId)
            )
        )
        .innerJoin(
            chatsTable,
            and(eq(chatsTable.serverId, tasksTable.serverId), eq(chatsTable.id, tasksTable.chatId))
        )
        .where(
            and(
                eq(tasksTable.serverId, runner.serverId),
                eq(tasksTable.number, parsed.number),
                eq(taskKeysTable.key, parsed.boardKey),
                isNotNull(tasksTable.chatId),
                eq(chatsTable.kind, 'task')
            )
        )
        .limit(1);
    const [row] = rows;
    return row?.chatId ? { chatId: row.chatId, taskId: row.taskId } : null;
}
