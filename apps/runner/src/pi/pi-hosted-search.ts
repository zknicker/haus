import type { Api, Model, Models } from '@earendil-works/pi-ai';
import * as z from 'zod';
import type { TurnEvent } from '../turn/turn-event.ts';
import {
    completionsNotes,
    responsesNotes,
    type SearchNote,
    type SearchSource,
} from './hosted-search-notes.ts';
import { hostedSearchTool } from './pi-web-search.ts';
import { MessagesSearchReader } from './vendor/pi-web-search/anthropic-search-events.ts';
import { normalizeSearchUrl } from './vendor/pi-web-search/search-url.ts';

interface HostedSearchCall {
    readonly id: string;
    query: string | null;
    readonly sources: SearchSource[];
}

export class HostedSearchLog {
    private searches: HostedSearchCall[] = [];
    private cited: SearchSource[] = [];
    private readonly readers: Partial<Record<Api, (event: unknown) => readonly SearchNote[]>>;

    constructor() {
        const messages = new MessagesSearchReader();
        this.readers = {
            'anthropic-messages': (event) => messages.read(event),
            'openai-codex-responses': responsesNotes,
            'openai-completions': completionsNotes,
            'openai-responses': responsesNotes,
        };
    }

    reads(api: Api) {
        return this.readers[api] !== undefined;
    }

    observe(event: unknown, api: Api) {
        for (const note of this.readers[api]?.(event) ?? []) {
            if (note.kind === 'cited') {
                addSources(this.cited, note.sources);
                continue;
            }
            const known = this.searches.find((search) => search.id === note.id);
            if (known) {
                known.query ??= note.query;
                addSources(known.sources, note.sources);
            } else {
                const search: HostedSearchCall = { id: note.id, query: note.query, sources: [] };
                addSources(search.sources, note.sources);
                this.searches.push(search);
            }
        }
    }

    drain() {
        const searches = this.searches;
        const last = searches.at(-1);
        if (last) {
            addSources(last.sources, this.cited);
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
}

export function withHostedSearch(models: Models, log: HostedSearchLog) {
    const streamSimple: Models['streamSimple'] = (model, context, options) =>
        models.streamSimple(model, context, {
            ...options,
            onPayload: async (payload, requestModel) =>
                withHostedTool(
                    (await options?.onPayload?.(payload, requestModel)) ?? payload,
                    requestModel,
                    log
                ),
            onProviderStreamEvent: async (event, eventModel) => {
                await options?.onProviderStreamEvent?.(event, eventModel);
                log.observe(event, eventModel.api);
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

function withHostedTool(payload: unknown, model: Model<Api>, log: HostedSearchLog) {
    const tool = hostedSearchTool(model.provider);
    const parsed = payloadSchema.safeParse(payload);
    if (!(tool && log.reads(model.api) && parsed.success)) {
        throw new Error(
            `The ${model.provider} request (${model.api}) is not one Haus can add web search to.`
        );
    }
    const tools = parsed.data.tools ?? [];
    return { ...parsed.data, tools: [...tools, tool] };
}

function addSources(into: SearchSource[], sources: readonly SearchSource[]) {
    for (const source of sources) {
        const url = normalizeSearchUrl(source.url);
        const known = into.find((candidate) => candidate.url === url);
        if (!known) {
            into.push({ title: source.title, url });
        } else if (known.title === null && source.title !== null) {
            into.splice(into.indexOf(known), 1, { title: source.title, url });
        }
    }
}

const payloadSchema = z.looseObject({ tools: z.array(z.unknown()).optional() });
