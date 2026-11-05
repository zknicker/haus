import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { AgentChatViewStaleError } from './chat-freshness-errors.ts';
import {
    advanceSeenThroughVisible,
    readFreshnessScope,
    unseenAttention,
} from './freshness-attention.ts';

/**
 * Refuses when the Agent has an unseen Message from someone else in the target
 * Chat, by the send hold's rule (`unseenAttention`), and otherwise advances its
 * seen cursor. Sits beside `claim-freshness`, the same rule for the Claim lane.
 */
export async function assertFreshAgentView(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string
) {
    const scope = await readFreshnessScope(db, runner, chatId);
    if (!scope) {
        throw new Error('The target Chat no longer exists.');
    }
    if (scope.latest <= scope.after) {
        return;
    }
    const [unseen] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(unseenAttention(scope, scope.after))
        .limit(1);
    if (unseen) {
        throw new AgentChatViewStaleError();
    }
    await advanceSeenThroughVisible(db, scope);
}
