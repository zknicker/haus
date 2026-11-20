import type { Models } from '@earendil-works/pi-ai';
import * as z from 'zod';
import type { TurnEvent } from '../turn/turn-event.ts';

interface Source {
    readonly title: string | null;
    readonly url: string;
}

interface HostedSearchCall {
    readonly id: string;
    readonly query: string | null;
    readonly sources: Source[];
}

export class HostedSearchLog {
    private searches: HostedSearchCall[] = [];
    private cited: Source[] = [];

    observe(event: unknown) {
        const parsed = streamEventSchema.safeParse(event);
        if (!parsed.success) {
            return;
        }
        const { data } = parsed;
        if (data.type === 'response.completed') {
            this.cite((data.response.citations ?? []).map((url) => ({ title: null, url })));
            return;
        }
        const { item } = data;
        if (item.type === 'web_search_call') {
            if (this.searches.some((search) => search.id === item.id)) {
                return;
            }
            const action = item.action;
            this.searches.push({
                id: item.id,
                query: action?.query ?? action?.queries?.join(' | ') ?? null,
                sources: (action?.sources ?? []).map((source) => ({
                    title: source.title ?? null,
                    url: source.url,
                })),
            });
            return;
        }
        this.cite(
            item.content.flatMap((part) =>
                (part.annotations ?? []).flatMap((annotation) =>
                    annotation.type === 'url_citation' && annotation.url
                        ? [{ title: annotation.title ?? null, url: annotation.url }]
                        : []
                )
            )
        );
    }

    drain() {
        const searches = this.searches;
        const last = searches.at(-1);
        if (last) {
            last.sources.push(...this.cited.filter((source) => !hasUrl(last.sources, source.url)));
        }
        this.searches = [];
        this.cited = [];
        return searches.flatMap((search) => {
            const facts = {
                nativeName: 'web_search',
                providerExecuted: true,
                toolCallId: search.id,
                toolName: 'webSearch',
            } as const;
            const events: TurnEvent[] = [
                { ...facts, input: search.query ? { query: search.query } : {}, type: 'tool-call' },
                {
                    ...facts,
                    output: { query: search.query, sources: search.sources },
                    type: 'tool-result',
                },
            ];
            return events;
        });
    }

    private cite(sources: readonly Source[]) {
        for (const source of sources) {
            if (!hasUrl(this.cited, source.url)) {
                this.cited.push(source);
            }
        }
    }
}

export function withHostedSearch(models: Models, log: HostedSearchLog) {
    const streamSimple: Models['streamSimple'] = (model, context, options) =>
        models.streamSimple(model, context, {
            ...options,
            onPayload: async (payload, requestModel) =>
                withHostedTool((await options?.onPayload?.(payload, requestModel)) ?? payload),
            onProviderStreamEvent: async (event, eventModel) => {
                await options?.onProviderStreamEvent?.(event, eventModel);
                log.observe(event);
            },
        });
    return new Proxy(models, {
        get(target, key) {
            if (key === 'streamSimple') {
                return streamSimple;
            }
            const value: unknown = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

function withHostedTool(payload: unknown) {
    const parsed = responsesPayloadSchema.safeParse(payload);
    if (!parsed.success) {
        throw new Error(
            'The provider request was not a Responses request, so Haus could not add web search.'
        );
    }
    const tools = parsed.data.tools ?? [];
    return { ...parsed.data, tools: [...tools, { type: 'web_search' }] };
}

function hasUrl(sources: readonly Source[], url: string) {
    return sources.some((source) => source.url === url);
}

const responsesPayloadSchema = z.looseObject({ tools: z.array(z.unknown()).optional() });

const sourceSchema = z.looseObject({ title: z.string().optional(), url: z.string() });

const streamEventSchema = z.discriminatedUnion('type', [
    z.looseObject({
        item: z.discriminatedUnion('type', [
            z.looseObject({
                action: z
                    .looseObject({
                        queries: z.array(z.string()).optional(),
                        query: z.string().optional(),
                        sources: z.array(sourceSchema).optional(),
                    })
                    .optional(),
                id: z.string(),
                type: z.literal('web_search_call'),
            }),
            z.looseObject({
                content: z.array(
                    z.looseObject({
                        annotations: z
                            .array(
                                z.looseObject({
                                    title: z.string().optional(),
                                    type: z.string(),
                                    url: z.string().optional(),
                                })
                            )
                            .optional(),
                    })
                ),
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
