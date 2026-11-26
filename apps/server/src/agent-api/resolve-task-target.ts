import { TASK_TARGET_PATTERN } from '@haus/api';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export function parseTaskTarget(target: string): string | null {
    return TASK_TARGET_PATTERN.exec(target)?.[1] ?? null;
}

export async function resolveTaskTargetChat(
    db: Reader,
    runner: Pick<ResolvedRunner, 'serverId'>,
    shortId: string
): Promise<{ chatId: string; taskId: string } | null> {
    const [row] = await db
        .select({ chatId: tasksTable.chatId, taskId: tasksTable.id })
        .from(tasksTable)
        .innerJoin(
            chatsTable,
            and(eq(chatsTable.serverId, tasksTable.serverId), eq(chatsTable.id, tasksTable.chatId))
        )
        .where(
            and(
                eq(tasksTable.serverId, runner.serverId),
                eq(tasksTable.shortId, shortId),
                isNotNull(tasksTable.chatId),
                eq(chatsTable.kind, 'task')
            )
        )
        .limit(1);
    return row?.chatId ? { chatId: row.chatId, taskId: row.taskId } : null;
}
