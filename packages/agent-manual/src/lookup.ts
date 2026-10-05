import { fuzzyMatch, lookupKey, queryTerms, textTokens } from './lookup-text.ts';
import type { ManualTopic } from './types.ts';

export interface ManualMatch {
    /** Query terms this topic matched, singularized, in query order. */
    matchedTerms: string[];
    score: number;
    topic: ManualTopic;
}

export type ManualSearchScope = 'all' | 'recipes';

export interface ManualLookup {
    /** Every topic matching at least one query term, best first. */
    rank(query: string, scope: ManualSearchScope): ManualMatch[];
    /** Exact id first, then a normalized id, alias, or title. */
    resolve(input: string): ManualTopic | null;
}

/** Per-term weight of the strongest field a term hits. */
const FIELD_WEIGHTS = {
    alias: 7,
    body: 1,
    id: 8,
    metadata: 2,
    summary: 4,
    title: 6,
    trigger: 5,
} as const;

type Field = keyof typeof FIELD_WEIGHTS;

const EXACT_KEY_BONUS = 50;
const PHRASE_BONUS = 10;

interface IndexedTopic {
    fields: Record<Field, ReadonlySet<string>>;
    /** Normalized keys a `get` or an exact search resolves to this topic. */
    keys: readonly string[];
    /** Normalized aliases, titles, and triggers that may contain the whole query. */
    phrases: readonly string[];
    topic: ManualTopic;
}

export function createManualLookup(topics: readonly ManualTopic[]): ManualLookup {
    const indexed = topics.map(indexTopic);
    const byId = new Map(topics.map((topic) => [topic.id, topic]));
    const byKey = new Map(indexed.flatMap((entry) => entry.keys.map((key) => [key, entry.topic])));
    const vocabulary = new Set(
        indexed.flatMap((entry) => Object.values(entry.fields).flatMap((tokens) => [...tokens]))
    );

    return {
        rank(query, scope) {
            const terms = queryTerms(query);
            const key = lookupKey(query);
            return indexed
                .filter((entry) => scope === 'all' || entry.topic.id.startsWith('recipes/'))
                .map((entry) => scoreTopic(entry, { key, terms, vocabulary }))
                .filter((match) => match.matchedTerms.length > 0 || match.score > 0)
                .sort(
                    (left, right) =>
                        right.score - left.score || left.topic.id.localeCompare(right.topic.id)
                );
        },
        resolve(input) {
            return byId.get(input) ?? byKey.get(lookupKey(input)) ?? null;
        },
    };
}

function scoreTopic(
    entry: IndexedTopic,
    query: { key: string; terms: readonly string[]; vocabulary: ReadonlySet<string> }
): ManualMatch {
    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of query.terms) {
        const weight = termWeight(entry, term, query.vocabulary);
        if (weight > 0) {
            score += weight;
            matchedTerms.push(term);
        }
    }
    if (query.key && entry.keys.includes(query.key)) {
        score += EXACT_KEY_BONUS;
    } else if (
        query.terms.length > 1 &&
        // Whole words only: "ask me" must not hit "task message".
        entry.phrases.some((phrase) => ` ${phrase} `.includes(` ${query.key} `))
    ) {
        score += PHRASE_BONUS;
    }
    return { matchedTerms, score, topic: entry.topic };
}

function termWeight(entry: IndexedTopic, term: string, vocabulary: ReadonlySet<string>): number {
    let best = 0;
    for (const field of Object.keys(FIELD_WEIGHTS) as Field[]) {
        if (entry.fields[field].has(term)) {
            best = Math.max(best, FIELD_WEIGHTS[field]);
        }
    }
    if (best > 0 || vocabulary.has(term)) {
        return best;
    }
    // Only a word the whole corpus lacks can be a typo; a real word stays itself.
    for (const field of Object.keys(FIELD_WEIGHTS) as Field[]) {
        if (fuzzyMatch(term, entry.fields[field])) {
            best = Math.max(best, Math.ceil(FIELD_WEIGHTS[field] / 2));
        }
    }
    return best;
}

function indexTopic(topic: ManualTopic): IndexedTopic {
    const aliases = topic.aliases ?? [];
    const triggers = topic.kind === 'recipe' ? topic.triggers : [];
    const metadata =
        topic.kind === 'recipe'
            ? [topic.class, topic.tier, ...topic.industries, ...topic.prereqs]
            : [];
    // A recipe index body lists every card; matching it would put the index in every result.
    const body = topic.kind === 'recipe-index' ? '' : topic.body;
    const shortId = topic.id.startsWith('recipes/') ? topic.id.slice('recipes/'.length) : null;
    return {
        fields: {
            alias: tokenSet(aliases),
            body: tokenSet([body]),
            id: tokenSet([topic.id]),
            metadata: tokenSet(metadata),
            summary: tokenSet([topic.summary]),
            title: tokenSet([topic.title]),
            trigger: tokenSet(triggers),
        },
        keys: [topic.id, ...(shortId ? [shortId] : []), topic.title, ...aliases].map(lookupKey),
        phrases: [topic.title, ...aliases, ...triggers].map(lookupKey),
        topic,
    };
}

function tokenSet(texts: readonly string[]): ReadonlySet<string> {
    return new Set(texts.flatMap(textTokens));
}
