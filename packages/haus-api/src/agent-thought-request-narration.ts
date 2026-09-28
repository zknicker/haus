/**
 * Request narration in Agent thoughts (ADR 0036): lines that say what the
 * requester wants or asked instead of the Agent's own step. The requester wrote
 * the ask, so such a bubble tells them nothing.
 */

/**
 * True when a line narrates what the requester wants or asked ("The user wants
 * the forecast", "Hmm, Zach is asking for…", "They're looking for a recap")
 * instead of the Agent's own work. Only person subjects count: the generic
 * "user"/"person"/"requester", a leading "they"/"he"/"she", and the
 * requester's own display name when known, matched whole-word. Any other
 * subject is work ("Postgres wants an index", "CI requested a rerun").
 */
export function narratesRequest(text: string, requester?: string | null): boolean {
    const lead = text.trim().replace(narrationOpener, '');
    const named = requesterNamePattern(requester);
    return (
        restatesRequest(genericSubject, text) ||
        restatesRequest(pronounSubject, lead) ||
        (named !== null && restatesRequest(named, text))
    );
}

/**
 * A leading sentence that restates the ask keeps only an own-work clause after
 * it ("The user wants X, so let me check Y" → "let me check Y"); null otherwise.
 */
export function withoutRequestNarration(
    sentence: string | null,
    requester?: string | null
): string | null {
    if (!(sentence && narratesRequest(sentence, requester))) {
        return sentence;
    }
    const match = ownWorkClausePattern.exec(sentence);
    const rest = match ? sentence.slice(match.index + match[0].length).trim() : '';
    return rest.length > 0 && !narratesRequest(rest, requester) ? rest : null;
}

/** A person subject followed by a request verb, or its possessive request noun. */
function restatesRequest(subject: string, text: string): boolean {
    return new RegExp(`${subject}(?:${requestVerb}|${requestNoun})`, 'iu').test(text);
}

/**
 * The requester's display name, and its first word ("Zach" for "Zach
 * Knickerbocker"), as a whole-word subject; null when no name is known.
 */
function requesterNamePattern(requester: string | null | undefined): string | null {
    const full = requester?.trim().replace(/\s+/gu, ' ') ?? '';
    if (full.length === 0) {
        return null;
    }
    const names = [...new Set([full, full.split(' ')[0] ?? full])].map(escapeRegExp);
    return `(?<![\\p{L}\\p{N}_])(?:${names.join('|')})`;
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const apostrophe = "['’]";

// "wants", "is asking", "'re looking for", "'d like": what a person asks, never plural "users want".
const requestVerb = [
    '\\s+(?:wants?|wanted|asks?|asked|requested|needs?|needed|would like)(?=\\s|$|[,.;:!?])',
    `(?:\\s+(?:is|are|was|were)\\s+|${apostrophe}(?:s|re)\\s+)(?:asking|requesting|looking for)\\b`,
    `${apostrophe}d like\\b`,
].join('|');

// A request noun ends the phrase or names the ask; "request log" is the Agent's own work.
const requestNoun = `(?:${apostrophe}s)?\\s+(?:request|ask|question)(?=$|[,.;:!?]|\\s+(?:for|to|about|is|was|here)\\b)`;

// "the user", "user's": not "users", and not "user table".
const genericSubject = '\\b(?:user|person|requester|requestor)';

// A pronoun is a requester only as the line's subject, or in "what they want".
const pronounSubject = '(?:^|\\bwhat\\s+)(?:they|he|she)';

const narrationOpener =
    /^(?:(?:okay|ok|alright|all right|so|hmm+|well|right|first|next|then|now|got it)[,\s]+|(?:looks|seems|sounds) like |(?:i'm |i am )?(?:noting|seeing|confirming|understanding|realizing|checking)(?: that)? |i (?:see|understand|know)(?: that)? )+/iu;

// Where a restating sentence hands off to the Agent's own step.
const ownWorkClausePattern =
    /(?:[,;:]|\s[—–-])\s*(?:(?:so|and|then|but)\s+)?(?=(?:let me|let's|i'll|i will|i should|i need to|i'm going to|i am going to|first|next)\b)/iu;
