import { and, eq, gt, ne, or, sql } from 'drizzle-orm';

import { advanceSeenCursor, readAgentInboxCursor } from '../agent-delivery/cursors.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxExactVisibilityTable,
    agentInboxTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';

/** One Agent run's freshness view of one Chat. */
export interface FreshnessScope {
    /** Where checks start: past the seen boundary and the newest message a hold showed. */
    after: number;
    chatId: string;
    generation: number;
    kind: string;
    latest: number;
    runner: ResolvedRunner;
    seen: number;
}

/** Reads the Chat head and this session's boundaries for a freshness check. */
export async function readFreshnessScope(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string
): Promise<FreshnessScope | null> {
    const [chat] = await db
        .select({ kind: chatsTable.kind, latest: chatsTable.lastMessageSequence })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        return null;
    }
    const cursor = await readAgentInboxCursor(db, { ...runner, chatId });
    return {
        after: Math.max(cursor.seen, cursor.heldThrough),
        chatId,
        generation: cursor.generation,
        kind: chat.kind,
        latest: chat.latest,
        runner,
        seen: cursor.seen,
    };
}

export function unseenAttention(scope: FreshnessScope, after: number) {
    const { chatId, generation, runner } = scope;
    return and(
        eq(chatMessagesTable.serverId, runner.serverId),
        eq(chatMessagesTable.chatId, chatId),
        gt(chatMessagesTable.sequence, after),
        or(
            sql`${chatMessagesTable.authorUserId} is not null`,
            and(
                sql`${chatMessagesTable.authorAgentId} is not null`,
                ne(chatMessagesTable.authorAgentId, runner.agentId)
            )
        ),
        sql`not exists (
            select 1 from ${agentInboxExactVisibilityTable} exact_visibility
            where exact_visibility.server_id = ${runner.serverId}
              and exact_visibility.agent_id = ${runner.agentId}
              and exact_visibility.session_generation = ${generation}
              and exact_visibility.chat_id = ${chatId}
              and exact_visibility.message_id = ${chatMessagesTable.id}
              and (
                exact_visibility.seen_at is not null
                or exact_visibility.served_run_id = ${runner.runId}
              )
        )`,
        scope.kind === 'task'
            ? undefined
            : sql`exists (
                select 1 from ${agentInboxTable} delivered
                where delivered.server_id = ${runner.serverId}
                  and delivered.agent_id = ${runner.agentId}
                  and delivered.dedupe_key = ${chatMessagesTable.id}
            )`
    );
}

/**
 * After a clean check, moves the seen boundary up to the first counted message
 * a hold only skipped, or to the Chat head when there is none. Undelivered
 * messages have no queued work to retire, so the boundary may pass them; a
 * hold's omitted messages stay ahead of it and are delivered as usual.
 */
export async function advanceSeenThroughVisible(db: HausDatabase, scope: FreshnessScope) {
    let through = scope.latest;
    if (scope.after > scope.seen) {
        const [gap] = await db
            .select({ first: sql<number | null>`min(${chatMessagesTable.sequence})::int` })
            .from(chatMessagesTable)
            .where(unseenAttention(scope, scope.seen));
        if (gap?.first != null) {
            through = gap.first - 1;
        }
    }
    await advanceSeenCursor(db, {
        agentId: scope.runner.agentId,
        chatId: scope.chatId,
        sequence: through,
        serverId: scope.runner.serverId,
    });
}
