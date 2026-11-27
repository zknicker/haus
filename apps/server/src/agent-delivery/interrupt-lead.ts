import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import type * as store from './store.ts';

export async function leadWithInterrupts<Row extends Pick<store.InboxItemRow, 'id'>>(
    db: HausDatabase,
    rows: Row[]
) {
    if (rows.length < 2) {
        return rows;
    }
    const interrupting = await db
        .select({ id: agentInboxTable.id })
        .from(agentInboxTable)
        .where(
            and(
                inArray(
                    agentInboxTable.id,
                    rows.map((row) => row.id)
                ),
                eq(agentInboxTable.delivery, 'interrupt')
            )
        );
    if (interrupting.length === 0) {
        return rows;
    }
    const leads = new Set(interrupting.map((row) => row.id));
    return [
        ...rows.filter((row) => leads.has(row.id)),
        ...rows.filter((row) => !leads.has(row.id)),
    ];
}
