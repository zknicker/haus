import { and, eq, isNotNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import { restoreLockedTask } from './task-archive.ts';
import { lockTask } from './task-read.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export async function restoreTaskForMessage(tx: Tx, input: { chatId: string; serverId: string }) {
    const [archived] = await tx
        .select({ id: tasksTable.id })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.chatId, input.chatId),
                isNotNull(tasksTable.agentId),
                isNotNull(tasksTable.archivedAt)
            )
        )
        .limit(1);
    if (!archived) {
        const unchanged = { events: [], sessions: [] };
        return unchanged;
    }
    const restored = await restoreLockedTask(tx, await lockTask(tx, input.serverId, archived.id));
    return { events: restored.events, sessions: restored.sessions ?? [] };
}
