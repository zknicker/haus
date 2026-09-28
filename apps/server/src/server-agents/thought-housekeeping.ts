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

/**
 * The check on a summarizer's own line, which already describes the work in
 * plain words. Narrower than `isHousekeepingThought`: it catches only clear
 * reply drafting and the Agent's own bookkeeping ("Drafting the availability
 * reply", "Claiming the new task", "Updating my memory"), so a line about work
 * that merely names an inbox, a manual, memory usage, or a decision still shows.
 */
export function isHousekeepingPhrase(phrase: string): boolean {
    return housekeepingPhrasePatterns.some((pattern) => pattern.test(phrase));
}

function leadingSentence(text: string): string {
    const trimmed = text.trim();
    const end = trimmed.search(/[.!?](?:\s|$)|\n/u);
    return end === -1 ? trimmed : trimmed.slice(0, end);
}

// Its own reply, not a reply to someone the person asked it to write to.
const ownReplyPattern =
    /\b(?:draft|compos|writ|polish|double-check)(?:e|es|s|ing)? (?:(?:the|my|this|that|a) )?(?:(?:quick|short|final|availability) )*(?:reply|response|answer)\b(?! (?:to|for) (?!them\b|him\b|her\b|you\b|the (?:channel|user|chat)\b))/iu;

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
    ownReplyPattern,
    /\b(?:my|this) (?:own )?(?:draft|reply)\b|\bmy (?:draft )?(?:response|answer)\b/iu,
    /\bget(?:ting)? oriented\b|\bwho i am\b|\bhaus profile\b/iu,
];

const housekeepingPhrasePatterns: readonly RegExp[] = [
    ownReplyPattern,
    /\b(?:my|this) (?:own )?(?:draft|reply)\b|\bmy (?:draft )?(?:response|answer)\b/iu,
    /\bdraft before (?:sending|posting)\b|\b(?:reviewing|checking|double-checking) (?:the )?draft$/iu,
    /\b(?:availability|summary|acknowledg(?:e?ment)) reply\b|\backnowledg(?:e?ment) (?:send|message)\b/iu,
    /\b(?:send|sending|post|posting|plan|planning) (?:an? |the )?(?:quick )?acknowledg(?:e?ment)\b/iu,
    /\bwillingness to (?:help|assist)\b/iu,
    /\bwhether (?:to|i should) (?:reply|respond|answer|post)\b|\bhow to (?:reply|respond)\b|\b(?:reply|respond) at all\b/iu,
    /\bmemory\.md\b|\b(?:my|own) memor(?:y|ies)\b|\bmemory (?:notes|index)\b/iu,
    /\b(?:update|updating|review|reviewing|re-?read(?:ing)?|saving to|adding to) memory\b(?! (?:usage|use|leaks?|limits?|pressure))/iu,
    /\bmy (?:own )?(?:notes|instructions|skills?|inbox|messages)\b|\bhaus (?:manual|profile|task|message)\b/iu,
    /\bclaim(?:s|ed|ing)? (?:a |the |this |that |my )?(?:new )?tasks?\b|\b(?:my|assigned) tasks?\b|\btask (?:board|status|synchroni[sz]ation)\b|\btasks? in progress\b/iu,
    /\bmanual (?:topic|recipe)s?\b|\bthe manual for (?:the )?(?:[\w-]+ )?(?:recipe|flags?)\b/iu,
    /\bget(?:ting)? oriented\b|\bwho i am\b/iu,
];
