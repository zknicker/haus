import { suffixProjectKey, suggestProjectKey } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { taskKeysTable } from '../postgres/schema.ts';
import { insertTaskKeyEntry, keyHasNumbered } from '../tasks/task-key-ledger.ts';
import { ProjectKeyError } from './project-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function allocateProjectKey(db: Reader, serverId: string, name: string) {
    const rows = await db
        .select({ key: taskKeysTable.key })
        .from(taskKeysTable)
        .where(eq(taskKeysTable.serverId, serverId));
    const taken = new Set(rows.map((row) => row.key));
    const base = suggestProjectKey(name);
    if (base === null) {
        return firstFree(taken, (n) => `P${n}`);
    }
    return taken.has(base) ? firstFree(taken, (n) => suffixProjectKey(base, n)) : base;
}

export async function insertProjectKey(
    tx: Pick<HausDatabase, 'insert'>,
    input: { key: string; serverId: string }
) {
    try {
        return await insertTaskKeyEntry(tx, input);
    } catch (error) {
        if (violatesConstraint(error, 'task_keys_server_key_key')) {
            throw new ProjectKeyError('TASK_KEY_TAKEN', input.key);
        }
        throw error;
    }
}

export async function renameProjectKey(
    tx: Pick<HausDatabase, 'select' | 'update'>,
    input: { key: string; serverId: string; taskKeyId: string }
) {
    if (await keyHasNumbered(tx, { keyId: input.taskKeyId, serverId: input.serverId })) {
        throw new ProjectKeyError('PROJECT_KEY_FIXED', input.key);
    }
    try {
        await tx
            .update(taskKeysTable)
            .set({ key: input.key })
            .where(
                and(
                    eq(taskKeysTable.serverId, input.serverId),
                    eq(taskKeysTable.id, input.taskKeyId)
                )
            );
    } catch (error) {
        if (violatesConstraint(error, 'task_keys_server_key_key')) {
            throw new ProjectKeyError('TASK_KEY_TAKEN', input.key);
        }
        throw error;
    }
}

function firstFree(taken: ReadonlySet<string>, candidate: (n: number) => string) {
    let n = 2;
    while (taken.has(candidate(n))) {
        n += 1;
    }
    return candidate(n);
}
