import type { ChatMessage, MessageClaim } from '@haus/api';

export interface ThreadWorkClaim {
    claim: MessageClaim;
    messageId: string;
}

/**
 * The Claim a Thread surface states in its header and metadata panel: the one
 * on a message inside the Thread when it was opened on that claim, else the
 * anchor's own. Either way that message's chip hides, since the panel says it.
 */
export function threadWorkClaim(
    anchor: Pick<ChatMessage, 'id' | 'claim'>,
    claimMessage: Pick<ChatMessage, 'id' | 'claim'> | null | undefined
): ThreadWorkClaim | null {
    if (claimMessage?.claim) {
        return { messageId: claimMessage.id, claim: claimMessage.claim };
    }
    return anchor.claim ? { messageId: anchor.id, claim: anchor.claim } : null;
}
