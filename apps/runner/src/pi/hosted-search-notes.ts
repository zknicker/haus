import * as z from 'zod';
import { urlCitation } from './vendor/pi-web-search/url-citation.ts';

export interface SearchSource {
    readonly title: string | null;
    readonly url: string;
}

export type SearchNote =
    | {
          readonly id: string;
          readonly kind: 'search';
          readonly query: string | null;
          readonly sources: readonly SearchSource[];
      }
    | { readonly kind: 'cited'; readonly sources: readonly SearchSource[] };

export function responsesNotes(event: unknown) {
    const parsed = responsesEventSchema.safeParse(event);
    if (!parsed.success) {
        return [];
    }
    const { data } = parsed;
    if (data.type === 'response.completed') {
        const sources = (data.response.citations ?? []).map((url) => ({ title: null, url }));
        return [cited(sources)];
    }
    const { item } = data;
    if (item.type === 'web_search_call') {
        const action = item.action;
        const opened = action?.url ? [{ title: null, url: action.url }] : [];
        const listed = (action?.sources ?? []).map((source) => ({
            title: source.title ?? null,
            url: source.url,
        }));
        const note: SearchNote = {
            id: item.id,
            kind: 'search',
            query: action?.query ?? action?.queries?.join(' | ') ?? null,
            sources: [...listed, ...opened],
        };
        return [note];
    }
    return [cited(item.content.flatMap((part) => citations(part.annotations ?? [])))];
}

export function completionsNotes(chunk: unknown) {
    const parsed = completionsChunkSchema.safeParse(chunk);
    if (!parsed.success) {
        return [];
    }
    const { data } = parsed;
    const sources = (data.choices ?? []).flatMap((choice) =>
        citations(choice.delta?.annotations ?? [])
    );
    const requests = data.usage?.server_tool_use_details?.web_search_requests ?? 0;
    if (sources.length === 0 && requests === 0) {
        return [];
    }
    const searched: SearchNote = {
        id: `${data.id}-web-search`,
        kind: 'search',
        query: null,
        sources,
    };
    return [searched];
}

function citations(annotations: readonly unknown[]) {
    return annotations.flatMap((annotation) => urlCitation(annotation) ?? []);
}

function cited(sources: SearchSource[]) {
    const note: SearchNote = { kind: 'cited', sources };
    return note;
}

const sourceSchema = z.looseObject({ title: z.string().optional(), url: z.string() });

const responsesEventSchema = z.discriminatedUnion('type', [
    z.looseObject({
        item: z.discriminatedUnion('type', [
            z.looseObject({
                action: z
                    .looseObject({
                        queries: z.array(z.string()).optional(),
                        query: z.string().optional(),
                        sources: z.array(sourceSchema).optional(),
                        url: z.string().optional(),
                    })
                    .optional(),
                id: z.string(),
                type: z.literal('web_search_call'),
            }),
            z.looseObject({
                content: z.array(z.looseObject({ annotations: z.array(z.unknown()).optional() })),
                type: z.literal('message'),
            }),
        ]),
        type: z.literal('response.output_item.done'),
    }),
    z.looseObject({
        response: z.looseObject({ citations: z.array(z.string()).optional() }),
        type: z.literal('response.completed'),
    }),
]);

const completionsChunkSchema = z.looseObject({
    choices: z
        .array(
            z.looseObject({
                delta: z.looseObject({ annotations: z.array(z.unknown()).nullish() }).nullish(),
            })
        )
        .optional(),
    id: z.string(),
    usage: z
        .looseObject({
            server_tool_use_details: z
                .looseObject({ web_search_requests: z.number().optional() })
                .nullish(),
        })
        .nullish(),
});
