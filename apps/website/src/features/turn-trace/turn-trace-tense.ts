/** A running call reads in the present tense; a settled one in the past. */
export type TraceTense = 'past' | 'present';

/** A row label in both tenses, so a live row can switch without re-deriving it. */
export interface TraceLabel {
    readonly past: string;
    readonly present: string;
}

export function traceLabel(past: string, present: string): TraceLabel {
    return { past, present };
}
