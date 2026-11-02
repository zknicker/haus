import type { AdventCountedFact, AdventFactStats } from '../fact-stats.ts';
import type { Line } from './line.ts';

/**
 * One door's copy. `lines` returns the hand-written variants that fit a
 * counted stat (some facts band their wording by value); `empty` voices a
 * door with nothing counted, and never states a number.
 */
export interface FactCopy<F extends AdventCountedFact> {
    empty: readonly Line[];
    lines(stat: AdventFactStats[F]): readonly Line[];
    title: string;
}

export type FactCopyBook<F extends AdventCountedFact = AdventCountedFact> = {
    [K in F]: FactCopy<K>;
};
