import { and, eq } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { messageClaimsTable } from '../postgres/schema.ts';
import { claimChangedTopic } from '../realtime/topics.ts';

export interface ClaimPlacement {
    chatId: string;
    messageId: string;
}

/**
 * Prepares `claim.changed` for a claim row the caller is about to commit. The
 * App invalidates the claim Message's entity and `claim.list`, so the event
 * names the Chat the Message sits in.
 */
export function prepareClaimEvent(
    input: ClaimPlacement & {
        serverId: string;
        type: 'claim.created' | 'claim.updated';
    }
) {
    return claimChangedTopic.prepare({
        chatId: input.chatId,
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
