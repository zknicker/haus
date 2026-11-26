import { randomInt } from 'node:crypto';
import { TASK_SHORT_ID_ALPHABET, TASK_SHORT_ID_LENGTH } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';

export async function mintTaskShortId(tx: Pick<HausDatabase, 'select'>, serverId: string) {
    for (;;) {
        const candidate = randomShortId();
        const [taken] = await tx
            .select({ id: tasksTable.id })
            .from(tasksTable)
            .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.shortId, candidate)))
            .limit(1);
        if (!taken) {
            return candidate;
        }
    }
}

export function randomShortId() {
    return Array.from(
        { length: TASK_SHORT_ID_LENGTH },
        () => TASK_SHORT_ID_ALPHABET[randomInt(TASK_SHORT_ID_ALPHABET.length)]
    ).join('');
}
