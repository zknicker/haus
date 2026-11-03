import type { ConnectionChipKind } from '@haus/api';

/** The Formatting ref an Agent must write to get a connection's chip. */
const chipRefs: Record<ConnectionChipKind, string> = {
    'amazon-product':
        "- B07XN9T11R: an Amazon ASIN renders as a product chip; write it beside a product's name whenever you name one",
};

/** One Formatting bullet per chip the Server's connections add. */
export function connectionChipRefs(kinds: readonly ConnectionChipKind[]): string[] {
    return kinds.map((kind) => chipRefs[kind]);
}
