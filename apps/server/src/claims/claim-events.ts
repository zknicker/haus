import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';
import { claimChangedTopic } from '../realtime/topics.ts';

/**
 * Where a claim's Message sits, as the claim row stores it: `chatId` is the
 * top-level Chat, and `threadChatId` the Thread the Message was posted in,
 * null for a top-level claim.
 */
export interface ClaimPlacement {
    chatId: string;
    messageId: string;
    threadChatId: string | null;
}

/**
 * Prepares `claim.changed` for a claim row the caller is about to commit. The
 * App invalidates the claim Message's entity and `claim.list`, so the event names
 * the Chat the Message sits in: a Thread claim's Thread, whose access follows
 * its parent.
 *
 * Pass the row's own columns (`ClaimPlacement`), never a projected
 * `MessageClaim`: its `threadChatId` is the claim's work Thread, which for a
 * top-level claim is the Thread anchored on it. That Thread may not exist, so
 * an event naming it reaches nobody (`canSeeChat`).
 */
export function prepareClaimEvent(
    input: ClaimPlacement & {
        serverId: string;
        type: 'claim.created' | 'claim.updated';
    }
) {
    return claimChangedTopic.prepare({
        chatId: input.threadChatId ?? input.chatId,
        kind: input.type === 'claim.created' ? 'created' : 'updated',
        messageId: input.messageId,
        serverId: input.serverId,
    });
}

/** Locks the claim row for update and returns its placement, or null when it is gone. */
export async function lockClaimPlacement(
    tx: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageId: string
): Promise<ClaimPlacement | null> {
    const [row] = await tx
        .select({
            chatId: messageClaimsTable.chatId,
            messageId: messageClaimsTable.messageId,
            threadChatId: messageClaimsTable.threadChatId,
        })
        .from(messageClaimsTable)
        .where(
            and(
                eq(messageClaimsTable.serverId, serverId),
                eq(messageClaimsTable.messageId, messageId)
            )
        )
        .for('update');
    return row ?? null;
}
