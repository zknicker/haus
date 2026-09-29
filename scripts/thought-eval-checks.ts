// Wording checks for the thought housekeeping eval (ADR 0036). Pure, so the
// runner's verdicts are unit-tested without calling Gemini.
import {
    normalizeThoughtLine,
    thoughtWordOverlap,
} from '../apps/server/src/server-agents/thought-novelty.ts';

export interface ThoughtEvalRules {
    /** Words or phrases a shown phrase must not contain, matched on word boundaries. */
    banned?: string[];
    /** A shown phrase must contain at least one of these, matched on word boundaries. */
    mentionsAny?: string[];
}

/** At most this share of a run's shown lines may open with "I". */
export const thoughtEvalMaxIOpeningShare = 1 / 3;
/** The prompt asks for eight words; the summarizer keeps up to ten. */
export const thoughtEvalTargetWords = 8;

/** Every problem with one shown phrase; empty when it passes. */
export function checkThoughtPhrase(phrase: string, rules: ThoughtEvalRules = {}): string[] {
    const problems: string[] = [];
    if (/\bright now\b/iu.test(phrase) || /\bnow$/iu.test(phrase.trim())) {
        problems.push('filler "now"');
    }
    const words = phrase.split(/\s+/u).filter(Boolean).length;
    if (words > thoughtEvalTargetWords) {
        problems.push(`${words} words`);
    }
    for (const banned of rules.banned ?? []) {
        if (containsWords(phrase, banned)) {
            problems.push(`banned "${banned}"`);
        }
    }
    if (rules.mentionsAny && !rules.mentionsAny.some((word) => containsWords(phrase, word))) {
        problems.push(`mentions none of ${rules.mentionsAny.join('/')}`);
    }
    return problems;
}

/** Whether a line opens with the pronoun "I" ("I'm", "I need", "I'll", …). */
export function opensWithI(phrase: string): boolean {
    return /^I(?:\b|['’])/u.test(phrase.trim());
}

function containsWords(phrase: string, words: string): boolean {
    const escaped = words.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(phrase);
}

/** Consecutive shown lines at least this similar by content words are near-duplicates. */
export const thoughtEvalNearDuplicateOverlap = 0.6;

/** How a shown line relates to the one before it in a run. */
export type ThoughtRepeat = 'duplicate' | 'near-duplicate' | null;

/**
 * `duplicate` when the lines match after case, punctuation, and spacing are
 * ignored; `near-duplicate` when their content words overlap by at least
 * `thoughtEvalNearDuplicateOverlap` (Jaccard), so "Checking the NYC weather"
 * after "OK, checking the weather in NYC" counts.
 */
export function thoughtRepeat(previous: string, next: string): ThoughtRepeat {
    if (normalizeThoughtLine(previous) === normalizeThoughtLine(next)) {
        return 'duplicate';
    }
    return thoughtWordOverlap(previous, next) >= thoughtEvalNearDuplicateOverlap
        ? 'near-duplicate'
        : null;
}
