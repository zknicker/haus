import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import type { InboxSeedContext } from './seed-inbox-context.ts';


/**
 * Blippy's claim on a message nobody promoted, stamped tracked the way a run
 * that settled without finishing stamps it. Tier reads `tracked` from the
 * stamp and liveness reads false, which is exactly a stalled claim.
 */
export async function seedStalledClaim(
    tx: HausDatabase,
    context: InboxSeedContext,
    input: { anchorMessageId: string; claimedAt: Date; trackedAt: Date }
): Promise<void> {
    const [numbered] = await tx
        .update(chatsTable)
        .set({ lastClaimNumber: sql`${chatsTable.lastClaimNumber} + 1` })
        .where(and(eq(chatsTable.serverId, context.serverId), eq(chatsTable.id, context.allChatId)))
        .returning({ number: chatsTable.lastClaimNumber });
    if (!numbered) {
        throw new Error('The development Inbox seed found no #all Chat to number a claim in.');
    }
    await tx.insert(messageClaimsTable).values({
        assigneeAgentId: context.blippyId,
        chatId: context.allChatId,
        claimedAt: input.claimedAt,
        createdAt: input.claimedAt,
        createdByAgentId: context.blippyId,
        messageId: input.anchorMessageId,
        number: numbered.number,
        origin: 'claimed',
        serverId: context.serverId,
        status: 'in_progress',
        trackedAt: input.trackedAt,
        updatedAt: input.trackedAt,
    });
}
