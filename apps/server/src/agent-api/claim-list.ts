import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { resolveAgentClaimTarget } from './claim-lookup.ts';
import { claimRows } from './claim-row.ts';
import { messageSelection, visibleChatSql } from './message-view.ts';

export const CLAIM_LIST_STATUSES = [
    'all',
    'todo',
    'in_progress',
    'in_review',
    'done',
    'closed',
] as const;
export type ClaimListStatus = (typeof CLAIM_LIST_STATUSES)[number];

/** Unfinished work is what an Agent lists to decide what to pick up next. */
const unfinishedStatuses = ['todo', 'in_progress', 'in_review'] as const;
export const CLAIM_LIST_LIMIT = 50;

export async function listAgentClaims(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { mine?: boolean; status?: ClaimListStatus; target?: string }
) {
    // A Thread target lists its parent's claims: the parent numbers them all.
    const chatId = input.target
        ? (await resolveAgentClaimTarget(db, runner, input.target)).claimChatId
        : null;
    const where = and(
        eq(messageClaimsTable.serverId, runner.serverId),
        chatId ? eq(messageClaimsTable.chatId, chatId) : visibleChatSql(runner),
        statusFilter(input.status),
        input.mine ? eq(messageClaimsTable.assigneeAgentId, runner.agentId) : undefined
    );
    const rows = await db
        .select({ message: messageSelection, claim: messageClaimsTable })
        .from(messageClaimsTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageClaimsTable.serverId),
                eq(chatMessagesTable.id, messageClaimsTable.messageId)
            )
        )
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, messageClaimsTable.serverId),
                eq(chatsTable.id, messageClaimsTable.chatId)
            )
        )
        .where(where)
        .orderBy(desc(messageClaimsTable.updatedAt))
        .limit(CLAIM_LIST_LIMIT + 1);
    const truncated = rows.length > CLAIM_LIST_LIMIT;
    const page = rows.slice(0, CLAIM_LIST_LIMIT);
    return {
        omitted: truncated ? (await countClaims(db, where)) - page.length : 0,
        claims: await claimRows(db, runner, page),
    };
}

function statusFilter(status: ClaimListStatus | undefined) {
    if (status === 'all') {
        return undefined;
    }
    return status
        ? eq(messageClaimsTable.status, status)
        : inArray(messageClaimsTable.status, [...unfinishedStatuses]);
}

async function countClaims(db: HausDatabase, where: ReturnType<typeof and>) {
    const [row] = await db
        .select({ total: count() })
        .from(messageClaimsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, messageClaimsTable.serverId),
                eq(chatsTable.id, messageClaimsTable.chatId)
            )
        )
        .where(where);
    return row?.total ?? 0;
}
