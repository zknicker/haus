import { resolveManualTopic, searchManualTopics } from './search.ts';

/** One `manual_lookup_audit` row, as exported for review. */
export interface ManualLookupRecord {
    agent: string;
    at: string;
    intent: string;
    lookup: string;
    operation: 'get' | 'search';
    reason: string;
}

/**
 * Replays recorded lookups against the current corpus and keeps the ones that
 * still miss: a get no id or alias resolves, or a search with no results. A
 * miss fixed by a later topic or alias drops out of the review on its own.
 */
export function unresolvedManualLookups(
    records: readonly ManualLookupRecord[]
): ManualLookupRecord[] {
    return records.filter((record) =>
        record.operation === 'get'
            ? resolveManualTopic(record.lookup) === null
            : searchManualTopics(record.lookup, { limit: 1, scope: 'all' }).length === 0
    );
}
