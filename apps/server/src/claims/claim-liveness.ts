import { and, eq, inArray, ne, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable } from '../postgres/schema.ts';
import { type ClaimWorkThreadRow, claimWorkThreadChatId } from './claim-work-thread.ts';

/** The claim columns liveness reads. */
export interface ClaimLivenessRow extends ClaimWorkThreadRow {
    assigneeAgentId: string | null;
}

/**
 * A claim is live while its assignee Agent's one in-flight run holds an inbox
 * row anchored on the claim's own message or on its work Thread (the Thread a
 * Thread claim sits in, which several claims can share) — attached to the
 * run by a pull, or offered to it as a notice in the run's own Chat. Liveness
 * is volatile execution state derived at read time, never a stored claim
 * column; the run's start and its settlement both emit `claim.updated`, so the
 * App learns about it the same way it learns about every other claim change.
 */
export async function loadLiveClaimMessageIds(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    rows: ClaimLivenessRow[]
): Promise<Set<string>> {
    const assigned = rows.filter((row) => row.assigneeAgentId !== null);
    if (assigned.length === 0) {
        return new Set();
    }
    const claimsByKey = new Map<string, string[]>();
    const hold = (key: string, messageId: string) => {
        claimsByKey.set(key, [...(claimsByKey.get(key) ?? []), messageId]);
    };
    for (const row of assigned) {
        hold(`${row.assigneeAgentId} ${row.messageId}`, row.messageId);
        hold(`${row.assigneeAgentId} ${claimWorkThreadChatId(row)}`, row.messageId);
    }
    const agentIds = [...new Set(assigned.map((row) => row.assigneeAgentId as string))];
    const served = await db
        .select({
            agentId: agentInboxTable.agentId,
            chatId: agentInboxTable.chatId,
            dedupeKey: agentInboxTable.dedupeKey,
        })
        .from(agentInboxTable)
        .innerJoin(
            agentDeliveryTable,
            and(
                eq(agentDeliveryTable.agentId, agentInboxTable.agentId),
                or(
                    eq(agentDeliveryTable.activeRunId, agentInboxTable.runId),
                    and(
                        eq(agentDeliveryTable.activeRunId, agentInboxTable.noticeRunId),
                        eq(agentDeliveryTable.activeRunChatId, agentInboxTable.chatId)
                    )
                )
            )
        )
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                inArray(agentInboxTable.agentId, agentIds),
                ne(agentInboxTable.state, 'seen')
            )
        );
    const live = new Set<string>();
    for (const row of served) {
        for (const key of [`${row.agentId} ${row.dedupeKey}`, `${row.agentId} ${row.chatId}`]) {
            for (const messageId of claimsByKey.get(key) ?? []) {
                live.add(messageId);
            }
        }
    }
    return live;
}
