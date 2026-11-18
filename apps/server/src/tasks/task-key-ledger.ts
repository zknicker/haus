import { GENERAL_TASK_KEY } from '@haus/api';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { chatsTable, taskKeysTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;
type Writer = Pick<HausDatabase, 'select' | 'update'>;

export async function insertTaskKeyEntry(
    tx: Pick<HausDatabase, 'insert'>,
    input: { key: string; serverId: string }
): Promise<string> {
    const id = createOpaqueId('tky');
    await tx.insert(taskKeysTable).values({ id, key: input.key, serverId: input.serverId });
    return id;
}

export async function insertGeneralTaskKey(
    tx: Pick<HausDatabase, 'insert' | 'update'>,
    serverId: string
): Promise<string> {
    const id = await insertTaskKeyEntry(tx, { key: GENERAL_TASK_KEY, serverId });
    await defaultChannelTaskKeys(tx, { serverId, taskKeyId: id });
    return id;
}

export async function allocateTaskNumber(
    tx: Writer,
    input: { keyId: string; serverId: string }
): Promise<number> {
    const [ledger] = await tx
        .select({ next: taskKeysTable.nextNumber })
        .from(taskKeysTable)
        .where(and(eq(taskKeysTable.serverId, input.serverId), eq(taskKeysTable.id, input.keyId)))
        .for('update');
    if (!ledger) {
        throw new Error(`Task key ${input.keyId} is not a ledger entry.`);
    }
    await tx
        .update(taskKeysTable)
        .set({ nextNumber: ledger.next + 1 })
        .where(and(eq(taskKeysTable.serverId, input.serverId), eq(taskKeysTable.id, input.keyId)));
    return ledger.next;
}

export async function resolveChannelTaskKeyId(
    db: Reader,
    input: { channelId: string; serverId: string }
): Promise<string> {
    const [channel] = await db
        .select({ taskKeyId: chatsTable.taskKeyId })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.channelId)))
        .limit(1);
    if (channel?.taskKeyId) {
        return channel.taskKeyId;
    }
    const general = await findGeneralTaskKeyId(db, input.serverId);
    if (!general) {
        throw new Error(`Server ${input.serverId} has no General Task key.`);
    }
    return general;
}

export async function findGeneralTaskKeyId(db: Reader, serverId: string): Promise<string | null> {
    const [general] = await db
        .select({ id: taskKeysTable.id })
        .from(taskKeysTable)
        .where(eq(taskKeysTable.serverId, serverId))
        .orderBy(
            desc(sql`${taskKeysTable.key} = ${GENERAL_TASK_KEY}`),
            asc(taskKeysTable.createdAt),
            asc(taskKeysTable.id)
        )
        .limit(1);
    return general?.id ?? null;
}

export async function defaultChannelTaskKeys(
    tx: Pick<HausDatabase, 'update'>,
    input: { serverId: string; taskKeyId: string }
): Promise<void> {
    await tx
        .update(chatsTable)
        .set({ taskKeyId: input.taskKeyId })
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.kind, 'channel'),
                isNull(chatsTable.taskKeyId)
            )
        );
}
