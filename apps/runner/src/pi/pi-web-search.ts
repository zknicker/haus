import type { Api, Model, Models } from '@earendil-works/pi-ai';
import * as z from 'zod';
import type { SearchBackend, SearchResult } from '../web/web-search.ts';

export const webSearchProviders = ['openai-codex', 'xai', 'google'] as const;

export type WebSearchProvider = (typeof webSearchProviders)[number];

export type WebSearchRoute = 'grounded' | 'hosted' | 'off';

const routes = {
    google: 'grounded',
    'openai-codex': 'hosted',
    xai: 'hosted',
} as const satisfies Record<WebSearchProvider, WebSearchRoute>;

export function webSearchRoute(provider: string, enabled: readonly WebSearchProvider[]) {
    const configured = enabled.find((candidate) => candidate === provider);
    const route: WebSearchRoute = configured ? routes[configured] : 'off';
    return route;
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
            return { answer: answer.trim() || null, results: groundedResults(grounding, count) };
        },
    };
    return backend;
}

function withGoogleSearch(payload: unknown) {
    const parsed = googlePayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error('the Gemini request was not in the shape Haus grounds.');
    }
    return { ...parsed.data, config: { ...parsed.data.config, tools: [{ googleSearch: {} }] } };
}

function groundedResults(grounding: readonly GroundingMetadata[], count: number) {
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
    return results.slice(0, count);
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
