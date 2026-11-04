export type ClaimStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'closed';

/**
 * How the claim row came to exist: a human composed a message as a claim or
 * converted an existing one, or an Agent claimed the message before working
 * on it. Chat reads this to tell a person's claim from an Agent's bookkeeping.
 */
export type ClaimOrigin = 'claimed' | 'composed' | 'converted';

/**
 * Which lens a claim belongs to. `background` is an Agent's own claim on work
 * it finished inside one turn — a lock and a record, kept off the Board and
 * the List. Everything else is `tracked`.
 */
export type ClaimTier = 'background' | 'tracked';

export const claimStatusOrder: ClaimStatus[] = [
    'todo',
    'in_progress',
    'in_review',
    'done',
    'closed',
];

export const claimStatusLabels: Record<ClaimStatus, string> = {
    closed: 'Closed',
    done: 'Done',
    in_progress: 'In progress',
    in_review: 'In review',
    todo: 'Todo',
};

// Status-colored chip fills for the transcript claim chip and status pills:
// the Raft chip palette rides the shared label tokens.
export const claimStatusClasses: Record<ClaimStatus, string> = {
    closed: 'bg-[var(--label-gray-bg)] text-[var(--label-gray-fg)]',
    done: 'bg-[var(--label-green-bg)] text-[var(--label-green-fg)]',
    in_progress: 'bg-[var(--label-blue-bg)] text-[var(--label-blue-fg)]',
    in_review: 'bg-[var(--label-purple-bg)] text-[var(--label-purple-fg)]',
    todo: 'bg-[var(--label-orange-bg)] text-[var(--label-orange-fg)]',
};

// Status hue for the TaskStatusDisc on neutral surfaces (board headers,
// list groups) where there is no chip fill to carry the color.
export const claimStatusDiscClasses: Record<ClaimStatus, string> = {
    closed: 'text-[var(--label-gray-fg)]',
    done: 'text-[var(--label-green-fg)]',
    in_progress: 'text-[var(--label-blue-fg)]',
    in_review: 'text-[var(--label-purple-fg)]',
    todo: 'text-[var(--label-orange-fg)]',
};

export function formatClaimNumber(claim: { number: number }) {
    return `#${claim.number}`;
}

/**
 * A claim as the transcript reads it: the identity the header mark renders and
 * the Tasks views index by. The lifecycle-rich record lives on the Server.
 */
export interface MessageClaim {
    assignee: {
        handle: string | null;
        id: string;
        kind?: 'agent';
    } | null;
    /** The assignee Agent is running a turn on this claim right now. */
    live: boolean;
    number: number;
    status: ClaimStatus;
    tier: ClaimTier;
}

/**
 * The assignee as a label, without guessing. A handle-less Agent has no honest
 * short name here, so the caller falls back to a resolved profile or shows
 * nothing rather than printing an opaque id.
 */
export function messageClaimAssigneeLabel(claim: MessageClaim) {
    return claim.assignee?.handle ? `@${claim.assignee.handle}` : null;
}
