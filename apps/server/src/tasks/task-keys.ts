import type { TaskKeyLedgerEntry } from '@haus/api';
import { asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { taskKeysTable } from '../postgres/schema.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function listTaskKeys(
    db: Reader,
    actor: TaskActor,
    input: { serverId: string }
): Promise<TaskKeyLedgerEntry[]> {
    await requireTaskActor(db, input.serverId, actor);
    const rows = await db
        .select()
        .from(taskKeysTable)
        .where(eq(taskKeysTable.serverId, input.serverId))
        .orderBy(asc(taskKeysTable.key));
    return rows.map(toLedgerEntry);
}

function toLedgerEntry(row: typeof taskKeysTable.$inferSelect): TaskKeyLedgerEntry {
    return {
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        key: row.key,
        nextNumber: row.nextNumber,
        serverId: row.serverId,
    };
}
