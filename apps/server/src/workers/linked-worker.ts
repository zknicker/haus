import type { Worker } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerHistoryLinksTable, workersTable } from '../postgres/schema.ts';
import { readWorkDetails, toWorker } from './worker-shape.ts';

/**
 * The `ChatMessage.worker` annotation for one page of Messages: each
 * Message's linked work in link order (ADR 0044). Whoever can read a Message
 * can see the work it links, so the caller's Message authorization is the
 * whole check. One batched read per page.
 */
export async function readLinkedWorker(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, Worker[]>> {
    const byMessage = new Map<string, Worker[]>();
    if (messageIds.length === 0) {
        return byMessage;
    }
    const rows = await db
        .select({ messageId: workerHistoryLinksTable.messageId, work: workersTable })
        .from(workerHistoryLinksTable)
        .innerJoin(
            workersTable,
            and(
                eq(workersTable.serverId, workerHistoryLinksTable.serverId),
                eq(workersTable.id, workerHistoryLinksTable.workerId)
            )
        )
        .where(
            and(
                eq(workerHistoryLinksTable.serverId, serverId),
                inArray(workerHistoryLinksTable.messageId, messageIds)
            )
        )
        .orderBy(asc(workerHistoryLinksTable.messageId), asc(workerHistoryLinksTable.ordinal));
    const details = await readWorkDetails(db, serverId, [
        ...new Set(rows.map(({ work }) => work.id)),
    ]);
    for (const { messageId, work } of rows) {
        byMessage.set(messageId, [
            ...(byMessage.get(messageId) ?? []),
            toWorker(work, details.get(work.id)),
        ]);
    }
    return byMessage;
}
