import type { ClaimList, MessageClaim } from '@haus/api';

export function replaceClaim(
    list: ClaimList | undefined,
    claim: MessageClaim
): ClaimList | undefined {
    if (!list) {
        return list;
    }
    return {
        ...list,
        claims: list.claims.map((item) =>
            item.claim.messageId === claim.messageId
                ? {
                      ...item,
                      message: { ...item.message, claim },
                      claim,
                  }
                : item
        ),
    };
}
