import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, chatMessagesTable, messageClaimsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
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
    const changed = new Map<string, { chatId: string; messageId: string }>();
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

function claimUpdatedEvent(scope: RunScope, claim: { chatId: string; messageId: string }) {
    return prepareClaimEvent({
        chatId: claim.chatId,
        messageId: claim.messageId,
        serverId: scope.serverId,
        type: 'claim.updated',
    });
}

async function claimsHeldByRun(db: ClaimWriter, scope: RunScope) {
    const rows = await db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
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
    const anchors = await readClaimAnchors(db, scope.serverId, [
        ...new Set(rows.map((row) => row.dedupeKey)),
    ]);
    return await db
        .select({
            chatId: messageClaimsTable.chatId,
            messageId: messageClaimsTable.messageId,
        })
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, scope.serverId),
                inArray(messageClaimsTable.messageId, [...anchors])
            )
        );
}

async function readClaimAnchors(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Set<string>> {
    const anchors = new Set(messageIds);
    if (messageIds.length === 0) {
        return anchors;
    }
    const replies = await db
        .select({
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(
            and(eq(chatMessagesTable.serverId, serverId), inArray(chatMessagesTable.id, messageIds))
        );
    for (const reply of replies) {
        for (const id of [reply.replyRootMessageId, reply.replyToMessageId]) {
            if (id) {
                anchors.add(id);
            }
        }
    }
    return anchors;
}
