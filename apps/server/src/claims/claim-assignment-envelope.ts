import { createLineBreakPattern } from '@haus/api';

/**
 * The assignment handoff is a private Agent-facing delivery, so it is typed
 * an inbox item rather than a Chat message: everything in `chat_messages` is
 * human-readable. The claim message stays the canonical Chat work item; this
 * envelope only makes the direct handoff explicit to the assignee, and reads
 * like the other bodiless deliveries the Agent drains.
 */
export function claimAssignmentEnvelope(input: {
    /** The assigner's Server handle, or null when they have not claimed one. */
    assignedByHandle: string | null;
    number: number;
    target: string;
    title: string;
}): string {
    // A member without a Server handle has no name to attribute this to, and
    // inventing one would misreport who reassigned the claim.
    const assignedBy = input.assignedByHandle ? ` assignedBy=@${input.assignedByHandle}` : '';
    const header = `[Haus claim assignment claim=#${input.number} target=${input.target}${assignedBy}]`;
    return `${header} ${envelopeTitle(input.title)}`;
}

/** The stable delivery identity of one assignment: one row per claim version. */
export function claimAssignmentKey(messageId: string, version: number): string {
    return `claim-assign:${messageId}:${version}`;
}

/**
 * The whole envelope is one line, so a title's own line breaks must flatten
 * to spaces first — plain `\s` misses FS/GS/RS and NEL, which would otherwise
 * ride through and forge a fresh column-0 line, the same bypass `indentPayload`
 * closes for Triggers. The universal set goes first, then ordinary whitespace
 * collapses as before.
 */
function envelopeTitle(title: string): string {
    const flat = title.replace(createLineBreakPattern(), ' ').replaceAll(/\s+/gu, ' ').trim();
    return flat.length > 80 ? `${flat.slice(0, 77).trimEnd()}…` : flat;
}
