import type { ConnectionChipKind } from '@haus/api';

/**
 * The Formatting ref an Agent must write to get a connection's chip, or null
 * when the chip comes from text Agents already write. A Linear issue chip
 * needs a linear.app issue link, which Agents paste from Linear's own results.
 */
const chipRefs: Record<ConnectionChipKind, string | null> = {
    'amazon-product':
        "- B07XN9T11R: an Amazon ASIN renders as a product chip; write it beside a product's name whenever you name one",
    'linear-issue': null,
};

/** One Formatting bullet per chip the Server's connections add that needs one. */
export function connectionChipRefs(kinds: readonly ConnectionChipKind[]): string[] {
    return kinds.flatMap((kind) => chipRefs[kind] ?? []);
}
