/**
 * The deterministic checks on a phrased thought before it shows (ADR 0036): a
 * line that names the machinery instead of the work is dropped, and a line
 * that rewords one the run already showed continues that work rather than
 * starting a new one. The summarizer is asked for both; these catch what it
 * lets through.
 */

import { agentThoughtTextMaxLength } from '@haus/api';
import type { ThoughtStream } from './agent-thought-summarizer.ts';

/** Lines whose content words overlap at least this much (Jaccard) say the same thing. */
export const thoughtRepeatOverlap = 0.6;

/** A phrased line and its workstream: `new` work or a finding, or `still` the shown work. */
export interface PhrasedThought {
    stream: ThoughtStream;
    text: string;
}

/**
 * The line to pace, or null when it names the machinery or only repeats what
 * already showed. A request's first line is new. A finding (a line from an
 * action's result that states something rather than an -ing step) is new
 * even when the model calls it continuing. A "new" line that rewords a shown
 * one continues that work instead. A continuing line reads "Still …" when it
 * opens with an -ing verb, and is dropped when it matches any shown line or
 * rewords an earlier "Still" line, so a long stretch never loops.
 */
export function judgeThoughtLine(
    line: PhrasedThought,
    context: { finding: boolean; previous: readonly string[]; request?: string | null }
): PhrasedThought | null {
    const { previous } = context;
    if (namesMechanism(line.text, context.request)) {
        return null;
    }
    if (previous.length === 0) {
        return { stream: 'new', text: line.text };
    }
    const finding = context.finding && !opensWithIng(line.text);
    let stream: ThoughtStream = finding ? 'new' : line.stream;
    if (stream === 'new' && repeatsShownLine(line.text, previous)) {
        stream = 'still';
    }
    if (stream === 'new') {
        return { stream, text: line.text };
    }
    const text = opensWithIng(line.text)
        ? withinLength(`Still ${line.text.charAt(0).toLowerCase()}${line.text.slice(1)}`)
        : line.text;
    const normalized = normalizeThoughtLine(text);
    const earlierStill = previous.filter((earlier) => /^still\b/iu.test(earlier));
    return previous.some((earlier) => normalizeThoughtLine(earlier) === normalized) ||
        repeatsShownLine(text, earlierStill)
        ? null
        : { stream, text };
}

/** "Still" costs a word: drop whole words from the end until the line fits the event's cap. */
function withinLength(text: string): string {
    const words = text.split(' ');
    while (words.join(' ').length > agentThoughtTextMaxLength && words.length > 2) {
        words.pop();
    }
    return words.join(' ').replace(/[\s,;:–—-]+$/u, '');
}

/** "Digging through the changelog", not "Saturday looks wet". */
function opensWithIng(text: string): boolean {
    return /^[A-Za-z]+ing\b/u.test(text.trim());
}

/** True when `line` matches or rewords any line the run already showed. */
export function repeatsShownLine(line: string, shown: readonly string[]): boolean {
    const normalized = normalizeThoughtLine(line);
    return shown.some(
        (earlier) =>
            normalizeThoughtLine(earlier) === normalized ||
            thoughtWordOverlap(earlier, line) >= thoughtRepeatOverlap
    );
}

/**
 * True when the line names a tool, format, or plumbing word ("Filtering the tags
 * with jq", "Requesting the API data") that the request itself does not use, so
 * a person asking about jq still sees "Checking the jq changelog".
 */
export function namesMechanism(line: string, request?: string | null): boolean {
    const allowed = new Set(
        (request?.toLowerCase().match(mechanismPattern) ?? []).map((word) => word.trim())
    );
    return (line.toLowerCase().match(mechanismPattern) ?? []).some(
        (word) => !allowed.has(word.trim())
    );
}

/** Jaccard overlap of two lines' content words, 0 to 1. */
export function thoughtWordOverlap(first: string, second: string): number {
    const a = contentWords(first);
    const b = contentWords(second);
    const shared = [...a].filter((word) => b.has(word)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : shared / union;
}

/** Case, punctuation, and spacing ignored. */
export function normalizeThoughtLine(line: string): string {
    return line
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
}

function contentWords(line: string): Set<string> {
    return new Set(
        normalizeThoughtLine(line)
            .split(' ')
            .filter((word) => word && !glueWords.has(word))
            // "forecasts" and "forecast" are one word here.
            .map((word) => (word.length > 3 ? word.replace(/s$/u, '') : word))
            // "Reading the notes" and "Reviewing the notes" name the same step.
            .map((word) => verbClasses.get(word) ?? word)
    );
}

// Tools, formats, and plumbing a person waiting on an answer does not need to hear.
const mechanismPattern =
    /\b(?:cli|jq|curl|wget|grep|ripgrep|sed|awk|json|yaml|xml|html|markdown|stdout|stderr|endpoints?|apis?|http|urls?|regex|tags?|pars(?:e|es|ing|er)|scrap(?:e|es|ing|er)|command line|terminal|shell)\b/gu;

// Verbs that name the same kind of step, folded to one word for overlap.
const verbClasses = new Map(
    Object.entries({
        check: [
            'checking',
            'reading',
            'reviewing',
            'scanning',
            'skimming',
            'looking',
            'examining',
            'inspecting',
            'studying',
            'going',
        ],
        fetch: [
            'fetching',
            'pulling',
            'getting',
            'retrieving',
            'gathering',
            'grabbing',
            'loading',
            'finding',
            'collecting',
            'querying',
        ],
        weigh: ['comparing', 'weighing', 'evaluating', 'assessing', 'judging'],
        sum: ['summarizing', 'analyzing', 'identifying', 'extracting', 'highlighting', 'noting'],
    }).flatMap(([verb, words]) => words.map((word) => [word, verb] as const))
);

// Openers and glue words that say nothing about the work.
const glueWords = new Set([
    'a',
    'again',
    'an',
    'and',
    'first',
    'for',
    'from',
    'hmm',
    'i',
    'im',
    'in',
    'its',
    'my',
    'next',
    'now',
    'of',
    'ok',
    'on',
    'still',
    'the',
    'their',
    'this',
    'to',
    'with',
]);
