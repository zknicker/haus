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

interface HostedSearchRequest {
    readonly cited: SearchSource[];
    done: boolean;
    readonly searches: HostedSearchCall[];
}

export class HostedSearchLog {
    private requests: HostedSearchRequest[] = [];
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

    request() {
        const request: HostedSearchRequest = { cited: [], done: false, searches: [] };
        this.requests.push(request);
        return request;
    }

    settle(request: HostedSearchRequest, answered: boolean) {
        request.done = true;
        if (!answered) {
            this.requests = this.requests.filter((known) => known !== request);
        }
    }

    clear() {
        this.requests = [];
    }

    observe(request: HostedSearchRequest, event: unknown, api: Api) {
        if (!this.requests.includes(request)) {
            return;
        }
        for (const note of this.readers[api]?.(event) ?? []) {
            if (note.kind === 'cited') {
                addSources(request.cited, note.sources);
                continue;
            }
            const known = request.searches.find((search) => search.id === note.id);
            if (known) {
                known.query ??= note.query;
                addSources(known.sources, note.sources);
            } else {
                const search: HostedSearchCall = { id: note.id, query: note.query, sources: [] };
                addSources(search.sources, note.sources);
                request.searches.push(search);
            }
        }
    }

    drain() {
        const answered = this.requests.filter((request) => request.done);
        this.requests = this.requests.filter((request) => !request.done);
        const searches = answered.flatMap((request) => {
            const last = request.searches.at(-1);
            if (last) {
                addSources(last.sources, request.cited);
            }
            return request.searches;
        });
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
    const streamSimple: Models['streamSimple'] = (model, context, options) => {
        const request = log.request();
        const stream = models.streamSimple(model, context, {
            ...options,
            onPayload: async (payload, requestModel) =>
                withHostedTool(
                    (await options?.onPayload?.(payload, requestModel)) ?? payload,
                    requestModel,
                    log
                ),
            onProviderStreamEvent: async (event, eventModel) => {
                await options?.onProviderStreamEvent?.(event, eventModel);
                log.observe(request, event, eventModel.api);
            },
        });
        stream.result().then(
            (message) =>
                log.settle(
                    request,
                    message.stopReason !== 'error' && message.stopReason !== 'aborted'
                ),
            () => log.settle(request, false)
        );
        return stream;
    };
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
