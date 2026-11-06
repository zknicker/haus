import { type ClaimWorkThreadRow, claimWorkThreadChatId } from '../claims/claim-work-thread.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readFreshnessScope, unseenAttention } from './freshness-attention.ts';

/**
 * Whether the claim's work Thread holds context from someone else that this
 * Agent has not seen: the Thread anchored on a top-level claim, or the Thread a
 * Thread claim sits in. A Thread counts every reply (`unseenAttention`).
 */
export async function hasUnseenClaimThreadContext(
    db: HausDatabase,
    runner: ResolvedRunner,
    claim: ClaimWorkThreadRow
) {
    const scope = await readFreshnessScope(db, runner, claimWorkThreadChatId(claim));
    if (!scope || scope.latest <= scope.after) {
        return false;
    }
    const [newer] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(unseenAttention(scope, scope.after))
        .limit(1);
    return Boolean(newer);
}
