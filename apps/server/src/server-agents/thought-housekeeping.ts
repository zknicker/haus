/**
 * The local stand-in for the summarizer's SKIP (ADR 0036): true when a title,
 * or the first sentence of a reasoning excerpt, is about the Agent's own
 * process — its memory, notes, inbox, tasks, manual, instructions, or skills,
 * whether to reply, or drafting its own reply — rather than the person's request. Deliberately narrow
 * nouns ("my memory", not "memory"), so a memory leak or release notes shows.
 */
export function isHousekeepingThought(text: string): boolean {
    const lead = leadingSentence(text);
    // "Reading memory for Zach's preference, then pulling sales" is about the request.
    if (/,? (?:and )?then\b/iu.test(lead)) {
        return false;
    }
    return housekeepingPatterns.some((pattern) => pattern.test(lead));
}

function leadingSentence(text: string): string {
    const trimmed = text.trim();
    const end = trimmed.search(/[.!?](?:\s|$)|\n/u);
    return end === -1 ? trimmed : trimmed.slice(0, end);
}

const housekeepingPatterns: readonly RegExp[] = [
    /\bmemory\.md\b|\b(?:my|own) memor(?:y|ies)\b|\bmemory (?:files?|notes|index)\b/iu,
    /\b(?:reading|checking|reviewing|loading|read|check|review|load) memory\b/iu,
    /\b(?:my|own) notes\b|\bnotes files?\b/iu,
    /\binbox\b|\bhaus message check\b/iu,
    /\b(?:checking|reading|check|read) (?:my |new |pending |the new )?messages\b/iu,
    /\bclaim(?:s|ed|ing)? (?:a |the |this |that |my )?(?:task|request|message)s?\b/iu,
    /\btask (?:board|list|status)\b|\b(?:my|assigned) tasks?\b|\bhaus task\b/iu,
    /\b(?:the|haus|my) manual\b|\bmanual (?:topic|recipe)s?\b/iu,
    /\b(?:my|the system|standing|haus) instructions\b/iu,
    /\b(?:my|the|that) skills?\b|\bskill(?: file|\.md)\b|\b(?:visuals?|design) skill\b/iu,
    /\bwhether (?:to|i should) (?:reply|respond|answer|post)\b|\bdecid(?:e|ing) whether\b/iu,
    /\bhow to (?:reply|respond)\b|\b(?:reply|respond) at all\b/iu,
    // Its own reply, not a reply to someone the person asked it to write to.
    /\b(?:draft|compos|writ|polish|double-check)(?:e|es|s|ing)? (?:(?:the|my|this|that|a) )?(?:(?:quick|short|final|availability) )*(?:reply|response|answer)\b(?! (?:to|for) (?!them\b|him\b|her\b|you\b|the (?:channel|user|chat)\b))/iu,
    /\b(?:my|this) (?:own )?(?:draft|reply)\b|\bmy (?:draft )?(?:response|answer)\b/iu,
    /\bget(?:ting)? oriented\b|\bwho i am\b|\bhaus profile\b/iu,
];
