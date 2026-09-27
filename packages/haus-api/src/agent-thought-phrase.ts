/**
 * Pure phrase shaping for Agent thoughts (ADR 0036), shared by the Computer
 * and the Server: one short, first-person line per reasoning block ("I'm
 * checking the bids"), and the bounded, scrubbed excerpt a Computer may send
 * when a block has no title.
 */

export const thoughtPhraseMaxWords = 8;
export const thoughtPhraseMaxLength = 80;
/** Untitled blocks shorter than this carry too little to summarize. */
export const thoughtMinimumReasoningLength = 40;
/** The most reasoning a Computer sends, and the Server summarizes, per block. */
export const thoughtReasoningExcerptMaxLength = 3000;

/**
 * The part of an untitled block that may leave the Computer: URLs, paths,
 * emails, and token-like strings removed, whitespace tidied, then the first
 * 3,000 characters. Null when too little remains to summarize.
 */
export function thoughtReasoningExcerpt(reasoning: string): string | null {
    const excerpt = reasoning
        .replace(/[^\S\n]*\S+/gu, (word) => (looksSensitive(word.trim()) ? '' : word))
        // Control characters other than line breaks never ride a frame.
        .replace(/[^\P{Cc}\n]+/gu, ' ')
        .replace(/[^\S\n]+/gu, ' ')
        .replace(/ *\n[\s]*/gu, '\n')
        .trim()
        .slice(0, thoughtReasoningExcerptMaxLength)
        .trim();
    return excerpt.length >= thoughtMinimumReasoningLength ? excerpt : null;
}

/**
 * The bold title a Codex reasoning summary leads with (`**Inspecting chart
 * data**`), or null. A block that folds several summaries keeps the latest.
 */
export function extractThoughtTitle(reasoning: string): string | null {
    const text = reasoning.trim();
    if (!text.startsWith('**')) {
        return null;
    }
    const titles = [...text.matchAll(/^\*\*([^*\n]{2,}?)\*\*\s*$/gmu)].map((match) => match[1]);
    const title = titles.at(-1);
    return title ? finishThoughtPhrase(inFirstPerson(title)) : null;
}

/**
 * A local, model-free phrase: the first sentence without narration filler,
 * with a stripped modal's verb turned present-progressive ("Let me check the
 * bids" → "Checking the bids").
 */
export function condenseThoughtLocally(reasoning: string): string | null {
    const sentence = firstSentence(reasoning.replace(/[*_`#>]+/gu, ' '));
    if (!sentence) {
        return null;
    }
    let words = sentence.split(/\s+/u).filter(Boolean);
    let strippedModal = false;
    for (let pass = 0; pass < 4; pass += 1) {
        const joined = words.join(' ');
        const filler = leadingFiller.find((pattern) => pattern.test(joined));
        if (!filler) {
            break;
        }
        const rest = joined.replace(filler, '');
        strippedModal = strippedModal || modalFiller.some((pattern) => pattern.test(joined));
        words = rest.split(/\s+/u).filter(Boolean);
    }
    if (words.length === 0) {
        return null;
    }
    if (strippedModal && words[0]) {
        words[0] = presentParticiple(words[0]);
    }
    return finishThoughtPhrase(inFirstPerson(words.join(' ')));
}

/**
 * Gives a gerund-led title or condensation the Agent's voice: "Inspecting
 * chart data" → "I'm inspecting chart data". Model answers keep their own voice.
 */
export function inFirstPerson(phrase: string): string {
    const match = /^\s*([A-Za-z]{3,}ing)\b/u.exec(phrase);
    return match
        ? `I'm ${phrase.trimStart().charAt(0).toLowerCase()}${phrase.trimStart().slice(1)}`
        : phrase;
}

/**
 * Normalizes any candidate — a title, a model's answer, or a local condensation
 * — into one plain line: no markup, quotes, URLs, or token-like strings, at most
 * `maxWords` words and 80 characters, capitalized, with no trailing period.
 */
export function finishThoughtPhrase(
    candidate: string,
    maxWords: number = thoughtPhraseMaxWords
): string | null {
    const words = candidate
        // Typographic apostrophes are apostrophes: "app’s" must stay one word.
        .replace(/[‘’]/gu, "'")
        .replace(/[\p{Cc}]+/gu, ' ')
        .split(/\s+/u)
        .filter((word) => !looksSensitive(word))
        .flatMap((word) => word.replace(/[*_`#>"“”]+/gu, ' ').split(/\s+/u))
        // Quote marks go; a plural possessive's trailing apostrophe ("charts'") stays.
        .map((word) => word.replace(/^'+/u, '').replace(/(?<![sS])'+$/u, ''))
        .filter((word) => word.length > 0);
    const kept = dropTrailingNow(words).slice(0, maxWords);
    while (kept.length > 1 && danglingWords.has(kept.at(-1)?.toLowerCase() ?? '')) {
        kept.pop();
    }
    let phrase = kept.join(' ').replace(/[\s.,;:!…-]+$/u, '');
    if (phrase.length > thoughtPhraseMaxLength) {
        phrase = phrase.slice(0, thoughtPhraseMaxLength).replace(/\s+\S*$/u, '');
    }
    if (phrase.length === 0) {
        return null;
    }
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * "…right now" and a trailing "now" are the summarizer's verbal tic, not
 * information: "Checking the NYC forecast right now" → "Checking the NYC forecast".
 */
function dropTrailingNow(words: readonly string[]): string[] {
    const kept = [...words];
    const bare = (word: string | undefined) =>
        word?.toLowerCase().replace(/[.,;:!?…]+$/u, '') ?? '';
    if (kept.length > 1 && bare(kept.at(-1)) === 'now') {
        kept.pop();
        if (kept.length > 1 && bare(kept.at(-1)) === 'right') {
            kept.pop();
        }
    }
    return kept;
}

function firstSentence(text: string): string | null {
    const trimmed = text.trim();
    const end = trimmed.search(/[.!?](\s|$)|\n/u);
    const sentence = (end === -1 ? trimmed : trimmed.slice(0, end)).trim();
    return sentence.length > 0 ? sentence : null;
}

/** Turns a base-form verb into its -ing form; good enough for status copy. */
export function presentParticiple(verb: string): string {
    const lower = verb.toLowerCase();
    if (lower.endsWith('ing') || !/^[a-z]+$/u.test(lower)) {
        return verb;
    }
    if (irregularParticiples[lower]) {
        return irregularParticiples[lower];
    }
    if (lower.endsWith('ie')) {
        return `${lower.slice(0, -2)}ying`;
    }
    if (lower.endsWith('e') && !/(ee|ye|oe)$/u.test(lower)) {
        return `${lower.slice(0, -1)}ing`;
    }
    if (/^[^aeiou]*[aeiou][^aeiouwxy]$/u.test(lower)) {
        return `${lower}${lower.at(-1)}ing`;
    }
    return `${lower}ing`;
}

const modalFiller = [
    /^(?:maybe |perhaps )?(?:let me|let's|i should|i need to|i'll|i will|i want to|i must|i can|i have to|i'm going to|i am going to)\s+/iu,
];

const leadingFiller = [
    /^(?:okay|ok|alright|all right|so|now|hmm+|well|right|first|next|then)[,\s]+/iu,
    /^(?:i'm|i am) (?:thinking about|now|currently)\s+/iu,
    /^(?:the user (?:wants|asked|is asking)(?: me)?(?: to)?)\s+/iu,
    ...modalFiller,
    /^(?:maybe|perhaps)\s+/iu,
];

const irregularParticiples: Record<string, string> = {
    be: 'being',
    begin: 'beginning',
    see: 'seeing',
    set: 'setting',
    get: 'getting',
    put: 'putting',
    run: 'running',
    stop: 'stopping',
    plan: 'planning',
    map: 'mapping',
    open: 'opening',
    visit: 'visiting',
    edit: 'editing',
};

const danglingWords = new Set([
    'a',
    'because',
    'but',
    'if',
    'is',
    'was',
    'an',
    'and',
    'as',
    'at',
    'by',
    'for',
    'from',
    'in',
    'into',
    'of',
    'on',
    'or',
    'the',
    'to',
    'with',
]);

/** URLs, emails, paths, and long opaque tokens never ride a thought or an excerpt. */
function looksSensitive(word: string): boolean {
    return (
        /:\/\//u.test(word) ||
        /@[^\s]+\./u.test(word) ||
        /^[~.]?\/\S/u.test(word) ||
        /[A-Za-z0-9_\-+=/]{24,}/u.test(word)
    );
}
