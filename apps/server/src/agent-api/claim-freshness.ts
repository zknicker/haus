import { and, eq, ne, or } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readFreshnessScope, unseenAttention } from './freshness-attention.ts';

export interface ClaimContextRow {
    chatId: string;
    messageId: string;
}

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
