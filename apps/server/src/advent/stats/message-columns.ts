import type { SQL } from 'drizzle-orm';
import type { AdventCountedFact } from '../fact-stats.ts';
import type { AdventScope } from '../year-scope.ts';

/**
 * A fact read from the member's messages: a scalar SQL expression over the
 * pass's `mine` CTE (and `addressed`, for Agent facts) that yields the fact's
 * stat as a JSON object shaped like `AdventFactStats[F]`, or null when empty.
 */
export type MessageColumns<F extends AdventCountedFact> = {
    [K in F]: (scope: AdventScope) => SQL;
};
