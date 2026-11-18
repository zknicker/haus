import { and, eq, ne, or } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readFreshnessScope, unseenAttention } from './freshness-attention.ts';

/** The claim columns a freshness check reads. */
export interface ClaimContextRow {
    chatId: string;
    messageId: string;
}

/**
 * Whether the claim's conversation holds context from someone else that this
 * Agent has not seen: the claimed message's inline replies, under the same
 * attention rule as any other freshness check (`unseenAttention`).
 */
export async function hasUnseenClaimContext(
    db: HausDatabase,
    runner: ResolvedRunner,
    claim: ClaimContextRow
) {
    const scope = await readFreshnessScope(db, runner, claim.chatId);
    if (!scope || scope.latest <= scope.after) {
        return false;
    }
    const [newer] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                unseenAttention(scope, scope.after),
                // A top-level message roots its own chain; only its replies count.
                ne(chatMessagesTable.id, claim.messageId),
                or(
                    eq(chatMessagesTable.replyRootMessageId, claim.messageId),
                    eq(chatMessagesTable.replyToMessageId, claim.messageId)
                )
            )
        )
        .limit(1);
    return Boolean(newer);
}
