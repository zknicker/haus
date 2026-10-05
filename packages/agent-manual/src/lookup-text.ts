/**
 * Light lookup normalization shared by Manual search and get: case, punctuation,
 * path separators, and English plurals. Deliberately no synonyms; aliases carry
 * observed vocabulary instead.
 */

const STOP_WORDS = new Set([
    'a',
    'about',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'can',
    'do',
    'does',
    'for',
    'from',
    'haus',
    'how',
    'i',
    'in',
    'is',
    'it',
    'me',
    'my',
    'of',
    'on',
    'or',
    'should',
    'the',
    'this',
    'to',
    'what',
    'when',
    'with',
    'you',
    'your',
]);

/** Shortest query term eligible for edit-distance-one typo matching. */
const MIN_FUZZY_TERM_LENGTH = 5;

/** Lowercase, collapse every non-alphanumeric run (`/ - _ . "`) to one space. */
export function normalizeLookup(text: string): string {
    return text
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/gu, ' ')
        .trim();
}

/** Normalized, singular form of a lookup id, alias, or title for exact matching. */
export function lookupKey(text: string): string {
    return normalizeLookup(text).split(' ').filter(Boolean).map(singular).join(' ');
}

/** Distinct meaningful query terms, singularized. */
export function queryTerms(text: string): string[] {
    return [...new Set(textTokens(text).filter((token) => !STOP_WORDS.has(token)))];
}

/** Every singularized token in a field, stop words included, for matching. */
export function textTokens(text: string): string[] {
    return normalizeLookup(text).split(' ').filter(Boolean).map(singular);
}

/** A corpus token one edit away from an unknown query term, or null. */
export function fuzzyMatch(term: string, tokens: Iterable<string>): string | null {
    if (term.length < MIN_FUZZY_TERM_LENGTH) {
        return null;
    }
    for (const token of tokens) {
        if (token.length >= MIN_FUZZY_TERM_LENGTH && withinOneEdit(term, token)) {
            return token;
        }
    }
    return null;
}

function singular(token: string): string {
    if (token.length > 4 && token.endsWith('ies')) {
        return `${token.slice(0, -3)}y`;
    }
    if (token.length > 4 && /(?:ches|shes|sses|xes)$/u.test(token)) {
        return token.slice(0, -2);
    }
    if (token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/u.test(token)) {
        return token.slice(0, -1);
    }
    return token;
}

function withinOneEdit(left: string, right: string): boolean {
    if (Math.abs(left.length - right.length) > 1) {
        return false;
    }
    const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
    let i = 0;
    let j = 0;
    let edited = false;
    while (i < shorter.length && j < longer.length) {
        if (shorter[i] === longer[j]) {
            i += 1;
            j += 1;
            continue;
        }
        if (edited) {
            return false;
        }
        edited = true;
        if (shorter.length === longer.length) {
            i += 1;
        }
        j += 1;
    }
    return true;
}
