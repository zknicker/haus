import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import * as store from './store.ts';

export async function readQueueDeliveryIds(tx: HausDatabase, agentId: string) {
    const rows = await tx
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(and(store.queuedFor(agentId), eq(agentInboxTable.delivery, 'queue')));
    return new Set(rows.map((row) => row.id));
}
