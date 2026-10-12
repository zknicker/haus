import type { CloudAgentWork } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentWorkLinksTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import { readRuns, toCloudAgentWork } from './cloud-agent-shape.ts';

/**
 * The `ChatMessage.cloudAgentWork` annotation for one page of Messages: each
 * Message's linked work in link order (ADR 0044). Whoever can read a Message
 * can see the work it links, so the caller's Message authorization is the
 * whole check. One batched read per page.
 */
export async function readLinkedCloudAgentWork(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, CloudAgentWork[]>> {
    const byMessage = new Map<string, CloudAgentWork[]>();
    if (messageIds.length === 0) {
        return byMessage;
    }
    const rows = await db
        .select({ messageId: cloudAgentWorkLinksTable.messageId, work: cloudAgentWorkTable })
        .from(cloudAgentWorkLinksTable)
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentWorkLinksTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentWorkLinksTable.workId)
            )
        )
        .where(
            and(
                eq(cloudAgentWorkLinksTable.serverId, serverId),
                inArray(cloudAgentWorkLinksTable.messageId, messageIds)
            )
        )
        .orderBy(asc(cloudAgentWorkLinksTable.messageId), asc(cloudAgentWorkLinksTable.ordinal));
    const runs = await readRuns(db, serverId, [...new Set(rows.map(({ work }) => work.id))]);
    for (const { messageId, work } of rows) {
        byMessage.set(messageId, [
            ...(byMessage.get(messageId) ?? []),
            toCloudAgentWork(work, runs.get(work.id) ?? []),
        ]);
    }
    return byMessage;
}
