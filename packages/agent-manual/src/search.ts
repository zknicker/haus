import { createManualLookup, type ManualMatch, type ManualSearchScope } from './lookup.ts';
import { queryTerms } from './lookup-text.ts';
import { manualTopics } from './topics.ts';
import type { ManualTopic } from './types.ts';

const lookup = createManualLookup(manualTopics);

/** Exact stable-id lookup; aliases and normalized forms go through resolveManualTopic. */
export function getManualTopic(topicId: string): ManualTopic | null {
    return manualTopics.find((topic) => topic.id === topicId) ?? null;
}

/** Resolve what an Agent typed: exact id, then a normalized id, alias, or title. */
export function resolveManualTopic(input: string): ManualTopic | null {
    return lookup.resolve(input);
}

/**
 * Ranked search. A topic qualifies when it matches at least half of the query's
 * meaningful terms; every term need not appear.
 */
export function searchManualTopics(
    query: string,
    input: { limit: number; scope: ManualSearchScope }
): ManualTopic[] {
    const terms = queryTerms(query);
    return lookup
        .rank(query, input.scope)
        .filter(({ matchedTerms }) => matchedTerms.length * 2 >= terms.length)
        .slice(0, input.limit)
        .map(({ topic }) => topic);
}

/** Closest topics for a miss: any matched term counts, so suggestions stay labeled as such. */
export function nearestManualTopics(
    query: string,
    input: { limit: number; scope: ManualSearchScope }
): ManualMatch[] {
    return lookup
        .rank(query, input.scope)
        .filter(({ matchedTerms }) => matchedTerms.length > 0)
        .slice(0, input.limit);
}
