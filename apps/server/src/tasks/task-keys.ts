import type { TaskKeyCreateInput, TaskKeyLedgerEntry } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { taskKeysTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor, type TaskActor } from './task-actor.ts';
import { TaskKeyConflictError } from './task-errors.ts';
import { insertTaskKeyEntry } from './task-key-ledger.ts';

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

export async function createTaskKey(
    db: HausDatabase,
    actor: TaskActor,
    input: TaskKeyCreateInput
): Promise<{ events: PreparedRealtimeEvent[]; taskKey: TaskKeyLedgerEntry }> {
    try {
        return await db.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await requireTaskActor(tx, input.serverId, actor);
            const id = await insertTaskKeyEntry(tx, input);
            const [row] = await tx
                .select()
                .from(taskKeysTable)
                .where(and(eq(taskKeysTable.serverId, input.serverId), eq(taskKeysTable.id, id)));
            if (!row) {
                throw new Error(`Task key ${input.key} did not persist.`);
            }
            return { events: [], taskKey: toLedgerEntry(row) };
        });
    } catch (cause) {
        if (violatesConstraint(cause, 'task_keys_server_key_key')) {
            throw new TaskKeyConflictError(input.key);
        }
        throw cause;
    }
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
