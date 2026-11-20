import type { Api, Model, Models } from '@earendil-works/pi-ai';
import type { RunnerModelConnection } from '@haus/api';
import * as z from 'zod';
import type { SearchBackend, SearchResult } from '../web/web-search.ts';
import {
    isGroundingRedirect,
    resolveRedirects,
} from './vendor/pi-web-search/grounding-redirects.ts';
import { normalizeSearchUrl } from './vendor/pi-web-search/search-url.ts';

const webSearchProviders = ['openai-codex', 'xai', 'google', 'openrouter'] as const;

type WebSearchProvider = (typeof webSearchProviders)[number];

export type WebSearchRoute = 'grounded' | 'hosted' | 'off';

type ProviderSearch = { route: 'grounded' } | { route: 'hosted'; tool: { type: string } };

const searches = {
    google: { route: 'grounded' },
    'openai-codex': { route: 'hosted', tool: { type: 'web_search' } },
    openrouter: { route: 'hosted', tool: { type: 'openrouter:web_search' } },
    xai: { route: 'hosted', tool: { type: 'web_search' } },
} as const satisfies Record<WebSearchProvider, ProviderSearch>;

export function webSearchOn(connection: Pick<RunnerModelConnection, 'webSearch'>, provider: string) {
    return connection.webSearch
        ? (webSearchProviders.find((candidate) => candidate === provider) ?? null)
        : null;
}

export function webSearchRoute(provider: WebSearchProvider | null) {
    const route: WebSearchRoute = provider ? searches[provider].route : 'off';
    return route;
}

export function hostedSearchTool(provider: string) {
    const known = webSearchProviders.find((candidate) => candidate === provider);
    const search: ProviderSearch | null = known ? searches[known] : null;
    return search?.route === 'hosted' ? search.tool : null;
}

export function groundedSearch(models: Models, model: Model<Api>) {
    const backend: SearchBackend = {
        async search({ count, query, signal }) {
            const grounding: GroundingMetadata[] = [];
            const message = await models.completeSimple(
                model,
                { messages: [{ content: query, role: 'user', timestamp: Date.now() }] },
                {
                    onPayload: (payload) => withGoogleSearch(payload),
                    onProviderStreamEvent: (chunk) => {
                        const metadata =
                            chunkSchema.safeParse(chunk).data?.candidates?.[0]?.groundingMetadata;
                        if (metadata) {
                            grounding.push(metadata);
                        }
                    },
                    signal,
                }
            );
            if (message.stopReason === 'error' || message.stopReason === 'aborted') {
                throw new Error(message.errorMessage ?? 'the grounded search request failed.');
            }
            const answer = message.content
                .map((block) => (block.type === 'text' ? block.text : ''))
                .join('');
            const results = await canonicalResults(groundedResults(grounding), signal);
            return { answer: answer.trim() || null, results: results.slice(0, count) };
        },
    };
    return backend;
}

async function canonicalResults(results: readonly SearchResult[], signal: AbortSignal | undefined) {
    const redirects = results.map((result) => result.url).filter(isGroundingRedirect);
    const resolved = await resolveRedirects(redirects, signal);
    const canonical: SearchResult[] = [];
    for (const result of results) {
        const url = normalizeSearchUrl(resolved.get(result.url) ?? result.url);
        if (!canonical.some((known) => known.url === url)) {
            canonical.push({ ...result, url });
        }
    }
    return canonical;
}

function withGoogleSearch(payload: unknown) {
    const parsed = googlePayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error('the Gemini request was not in the shape Haus grounds.');
    }
    return { ...parsed.data, config: { ...parsed.data.config, tools: [{ googleSearch: {} }] } };
}

function groundedResults(grounding: readonly GroundingMetadata[]) {
    const results: SearchResult[] = [];
    for (const metadata of grounding) {
        const chunks = metadata.groundingChunks ?? [];
        for (const [index, chunk] of chunks.entries()) {
            const url = chunk.web?.uri;
            if (!url || results.some((result) => result.url === url)) {
                continue;
            }
            const snippet = (metadata.groundingSupports ?? [])
                .filter((support) => support.groundingChunkIndices?.includes(index))
                .map((support) => support.segment?.text ?? '')
                .filter((text) => text !== '')
                .join(' ');
            results.push({ snippet, title: chunk.web?.title ?? new URL(url).hostname, url });
        }
    }
    return results;
}

const googlePayloadSchema = z.looseObject({ config: z.looseObject({}).optional() });

const groundingSchema = z.looseObject({
    groundingChunks: z
        .array(
            z.looseObject({
                web: z.looseObject({ title: z.string().optional(), uri: z.string() }).optional(),
            })
        )
        .optional(),
    groundingSupports: z
        .array(
            z.looseObject({
                groundingChunkIndices: z.array(z.number()).optional(),
                segment: z.looseObject({ text: z.string().optional() }).optional(),
            })
        )
        .optional(),
});

type GroundingMetadata = z.infer<typeof groundingSchema>;

const chunkSchema = z.looseObject({
    candidates: z
        .array(z.looseObject({ groundingMetadata: groundingSchema.optional() }))
        .optional(),
});
