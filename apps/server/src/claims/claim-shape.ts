import type { MessageClaim } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';
import { loadLiveClaimMessageIds } from './claim-liveness.ts';
import { resolveClaimTier } from './claim-tier.ts';
import { claimWorkThreadChatId } from './claim-work-thread.ts';

export type MessageClaimRow = typeof messageClaimsTable.$inferSelect;

/** What a claim row cannot answer alone: its lens and whether a run holds it. */
export interface ClaimDerivation {
    live: boolean;
    tier: MessageClaim['tier'];
}

export async function findMessageClaim(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageId: string
): Promise<MessageClaim | null> {
    const [row] = await db
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, serverId),
                eq(messageClaimsTable.messageId, messageId)
            )
        )
        .limit(1);

    return row ? await toMessageClaim(db, row) : null;
}

export async function listMessageClaimMap(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, MessageClaim>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select()
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, serverId),
                inArray(messageClaimsTable.messageId, messageIds)
            )
        );
    const claims = await projectMessageClaims(db, serverId, rows);

    return new Map(claims.map((claim) => [claim.messageId, claim]));
}

export async function toMessageClaim(
    db: Pick<HausDatabase, 'select'>,
    row: MessageClaimRow
): Promise<MessageClaim> {
    const [claim] = await projectMessageClaims(db, row.serverId, [row]);
    return claim;
}

/**
 * Reads tier evidence and liveness once for a whole batch of rows.
 *
 * Sequential, never `Promise.all`: every claim write projects its result before
 * committing, so `db` is usually the caller's transaction, and overlapping
 * reads on that one reserved connection wedge it — the transaction goes idle
 * still holding the Server row lock it took first, and every later durable
 * write queues behind it forever.
 */
export async function projectMessageClaims(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    rows: MessageClaimRow[]
): Promise<MessageClaim[]> {
    if (rows.length === 0) {
        return [];
    }
    const live = await loadLiveClaimMessageIds(db, serverId, rows);
    return rows.map((row) =>
        toMessageClaimWithDerivation(row, {
            live: live.has(row.messageId),
            tier: resolveClaimTier(row),
        })
    );
}

export function toMessageClaimWithDerivation(
    row: MessageClaimRow,
    derivation: ClaimDerivation
): MessageClaim {
    return {
        assigneeAgentId: row.assigneeAgentId,
        chatId: row.chatId,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        createdByAgentId: row.createdByAgentId,
        createdByUserId: row.createdByUserId,
        live: derivation.live,
        messageId: row.messageId,
        number: row.number,
        origin: row.origin,
        status: row.status,
        threadChatId: claimWorkThreadChatId(row),
        tier: derivation.tier,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    };
}
