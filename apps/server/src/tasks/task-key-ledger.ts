import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { taskKeysTable } from '../postgres/schema.ts';

type Writer = Pick<HausDatabase, 'select' | 'update'>;

export async function insertTaskKeyEntry(
    tx: Pick<HausDatabase, 'insert'>,
    input: { key: string; serverId: string }
): Promise<string> {
    const id = createOpaqueId('tky');
    await tx.insert(taskKeysTable).values({ id, key: input.key, serverId: input.serverId });
    return id;
}

export async function allocateIssueNumber(
    tx: Writer,
    input: { keyId: string; serverId: string }
): Promise<number> {
    const [ledger] = await tx
        .select({ next: taskKeysTable.nextNumber })
        .from(taskKeysTable)
        .where(and(eq(taskKeysTable.serverId, input.serverId), eq(taskKeysTable.id, input.keyId)))
        .for('update');
    if (!ledger) {
        throw new Error(`Project key ${input.keyId} is not a ledger entry.`);
    }
    await tx
        .update(taskKeysTable)
        .set({ nextNumber: ledger.next + 1 })
        .where(and(eq(taskKeysTable.serverId, input.serverId), eq(taskKeysTable.id, input.keyId)));
    return ledger.next;
}

export async function keyHasNumbered(
    db: Pick<HausDatabase, 'select'>,
    input: { keyId: string; serverId: string }
) {
    const [ledger] = await db
        .select({ next: taskKeysTable.nextNumber })
        .from(taskKeysTable)
        .where(and(eq(taskKeysTable.serverId, input.serverId), eq(taskKeysTable.id, input.keyId)))
        .limit(1);
    return (ledger?.next ?? 1) > 1;
}
