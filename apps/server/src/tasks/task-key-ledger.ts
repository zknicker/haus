import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { projectsTable, taskKeysTable } from '../postgres/schema.ts';

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
    const [project] = await db
        .select({ taskKeyId: projectsTable.taskKeyId })
        .from(projectsTable)
        .where(
            and(
                eq(projectsTable.serverId, input.serverId),
                eq(projectsTable.chatId, input.channelId)
            )
        )
        .limit(1);
    if (!project) {
        throw new Error(`Channel ${input.channelId} is not a Project.`);
    }
    return project.taskKeyId;
}
