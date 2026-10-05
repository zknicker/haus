import type { ManualSearchScope } from './lookup.ts';
import { normalizeLookup } from './lookup-text.ts';
import { nearestManualTopics } from './search.ts';

/**
 * Recovery copy for Manual misses. A miss names the closest topics with the
 * terms they matched, plus copy-runnable commands, so the Agent's next lookup
 * is one step rather than a guess.
 */
export interface ManualMissGuidance {
    message: string;
    nextAction: string;
}

const MISS_SUGGESTION_LIMIT = 3;
const DEFAULT_INTENT = 'Find the Haus workflow I need';
const DEFAULT_REASON = 'My first Manual lookup did not resolve';

export function manualGetMissGuidance(topic: string): ManualMissGuidance {
    const lines = [
        ...closestMatchLines(topic, 'all'),
        'If you do not know the exact id, search for it:',
        `  ${manualSearchCommand(searchKeywords(topic))}`,
        'Or browse all topics:',
        `  ${manualGetCommand('index')}`,
    ];
    return {
        message: `Manual topic '${topic}' was not found.`,
        nextAction: lines.join('\n'),
    };
}

export function manualSearchMissGuidance(
    query: string,
    scope: ManualSearchScope
): ManualMissGuidance {
    const scopeNote = scope === 'recipes' ? ' among recipes' : '';
    const widen =
        scope === 'recipes'
            ? [
                  'Search every topic, not only recipes:',
                  `  ${manualSearchCommand(searchKeywords(query))}`,
              ]
            : [];
    const lines = [
        ...closestMatchLines(query, 'all'),
        'Retry with different keywords, such as a haus command family noun (message, reminder, channel).',
        ...widen,
        'Or browse all topics:',
        `  ${manualGetCommand('index')}`,
    ];
    return {
        message: `No Manual topics matched "${query}"${scopeNote}.`,
        nextAction: lines.join('\n'),
    };
}

export function manualGetCommand(topic: string): string {
    return `haus manual get ${topic} --intent "${DEFAULT_INTENT}" --reason "${DEFAULT_REASON}"`;
}

function manualSearchCommand(keywords: string): string {
    return `haus manual search "${keywords}" --intent "${DEFAULT_INTENT}" --reason "${DEFAULT_REASON}"`;
}

function closestMatchLines(query: string, scope: ManualSearchScope): string[] {
    const nearest = nearestManualTopics(query, { limit: MISS_SUGGESTION_LIMIT, scope });
    const first = nearest[0];
    if (!first) {
        return [];
    }
    return [
        'Closest matches by content:',
        ...nearest.map(
            ({ matchedTerms, topic }, index) =>
                `  ${index + 1}. ${topic.id} — "${topic.title}" (matched: ${matchedTerms.join(', ')})`
        ),
        'Open the closest:',
        `  ${manualGetCommand(first.topic.id)}`,
    ];
}

/** Plain keywords from a missed id, safe inside double quotes in any shell. */
function searchKeywords(topic: string): string {
    return normalizeLookup(topic) || 'the workflow I need';
}
