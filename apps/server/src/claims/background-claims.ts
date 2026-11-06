import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { anchorMessageIdForThreadChatId } from '../threads/thread-id.ts';
import { prepareClaimEvent } from './claim-events.ts';

type ClaimWriter = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

interface RunScope {
    agentId: string;
    runId: string;
    serverId: string;
}

/**
 * Records the Agent's outstanding background claims when its run settles.
 *
 * A background claim is a lock the Agent took to do work inside one turn. A
 * settled run never proves that the work is finished: only the Agent's explicit
 * `done` mutation can close it. Any still-open claim is stamped tracked so a
 * person can see work that outlived the run.
 *
 * Each changed claim emits `claim.updated`, as does the liveness edge every
 * settling run crosses, so no client polls for either.
 */
export async function settleAgentBackgroundClaims(
    db: ClaimWriter,
    scope: RunScope
): Promise<PreparedRealtimeEvent[]> {
    const candidates = await db
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, scope.serverId),
                eq(messageClaimsTable.assigneeAgentId, scope.agentId),
                eq(messageClaimsTable.origin, 'claimed'),
                eq(messageClaimsTable.status, 'in_progress'),
                isNull(messageClaimsTable.trackedAt)
            )
        );
    const changed = new Map<
        string,
        { chatId: string; messageId: string; threadChatId: string | null }
    >();
    for (const claim of candidates) {
        await db
            .update(messageClaimsTable)
            .set({
                trackedAt: sql`now()`,
                updatedAt: sql`now()`,
                version: sql`${messageClaimsTable.version} + 1`,
            })
            .where(
                and(
                    eq(messageClaimsTable.serverId, scope.serverId),
                    eq(messageClaimsTable.messageId, claim.messageId)
                )
            );
        changed.set(claim.messageId, claim);
    }
    for (const held of await claimsHeldByRun(db, scope)) {
        changed.set(held.messageId, held);
    }
    return [...changed.values()].map((claim) => claimUpdatedEvent(scope, claim));
}

/** `claim.updated` for every claim this run holds — the liveness edge, either way. */
export async function runLivenessClaimEvents(
    db: ClaimWriter,
    scope: RunScope
): Promise<PreparedRealtimeEvent[]> {
    return (await claimsHeldByRun(db, scope)).map((claim) => claimUpdatedEvent(scope, claim));
}

function claimUpdatedEvent(
    scope: RunScope,
    claim: { chatId: string; messageId: string; threadChatId: string | null }
) {
    return prepareClaimEvent({
        chatId: claim.chatId,
        messageId: claim.messageId,
        serverId: scope.serverId,
        threadChatId: claim.threadChatId,
        type: 'claim.updated',
    });
}

/**
 * The claims this run's inbox rows anchor on, by message or by Thread. A Thread
 * row holds both the claim on the Thread's anchor and every claim posted inside
 * that Thread: the Thread is their shared work surface.
 */
async function claimsHeldByRun(db: ClaimWriter, scope: RunScope) {
    const rows = await db
        .select({ chatId: agentInboxTable.chatId, dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, scope.serverId),
                eq(agentInboxTable.agentId, scope.agentId),
                ne(agentInboxTable.state, 'seen'),
                or(
                    eq(agentInboxTable.runId, scope.runId),
                    eq(agentInboxTable.noticeRunId, scope.runId)
                )
            )
        );
    if (rows.length === 0) {
        return [];
    }
    const anchors = new Set<string>();
    const threadChatIds = new Set<string>();
    for (const row of rows) {
        anchors.add(row.dedupeKey);
        const threadAnchor = row.chatId ? anchorMessageIdForThreadChatId(row.chatId) : null;
        if (row.chatId && threadAnchor) {
            anchors.add(threadAnchor);
            threadChatIds.add(row.chatId);
        }
    }
    return await db
        .select({
            chatId: messageClaimsTable.chatId,
            messageId: messageClaimsTable.messageId,
            threadChatId: messageClaimsTable.threadChatId,
        })
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, scope.serverId),
                threadChatIds.size > 0
                    ? or(
                          inArray(messageClaimsTable.messageId, [...anchors]),
                          inArray(messageClaimsTable.threadChatId, [...threadChatIds])
                      )
                    : inArray(messageClaimsTable.messageId, [...anchors])
            )
        );
}
