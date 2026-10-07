import { countCodeLines } from '../../lib/code-language.ts';

/** Lines a folded block shows. */
export const traceFoldLines = 8;

/**
 * A block folds only when it hides a real stretch: a fold that hides a line
 * or two costs a press to save nothing.
 */
const traceFoldThreshold = 11;

export interface TraceLineFold {
    /** The lines a folded block shows, without a trailing newline. */
    readonly head: string;
    readonly hiddenLines: number;
}

/** Where a long block folds, or null when it is short enough to show whole. */
export function foldTraceLines(text: string): TraceLineFold | null {
    const lines = countCodeLines(text);
    if (lines < traceFoldThreshold) {
        return null;
    }
    return {
        head: text.split('\n', traceFoldLines).join('\n'),
        hiddenLines: lines - traceFoldLines,
    };
}

/** The fold control's words: what pressing it does. */
export function formatTraceFold(hiddenLines: number | null, isExpanded: boolean): string {
    if (isExpanded) {
        return 'Show less';
    }
    if (hiddenLines === null) {
        return 'Show more';
    }
    return `Show ${hiddenLines.toLocaleString()} more ${hiddenLines === 1 ? 'line' : 'lines'}`;
}
