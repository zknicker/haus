import * as z from 'zod';
import type { SearchNote, SearchSource } from '../../hosted-search-notes.ts';

export class MessagesSearchReader {
    private readonly calls = new Map<number, { id: string; input: string }>();

    read(event: unknown) {
        const parsed = eventSchema.safeParse(event);
        if (!parsed.success) {
            return [];
        }
        const { data } = parsed;
        if (data.type === 'message_start') {
            this.calls.clear();
            return [];
        }
        if (data.type === 'content_block_start') {
            return this.start(data.index, data.content_block);
        }
        if (data.type === 'content_block_stop') {
            const call = this.calls.get(data.index);
            this.calls.delete(data.index);
            const query = call ? queryOf(call.input) : null;
            return call && query ? [search(call.id, query, [])] : [];
        }
        const { delta } = data;
        if (delta.type === 'input_json_delta') {
            const call = this.calls.get(data.index);
            if (call) {
                call.input += delta.partial_json;
            }
            return [];
        }
        const { citation } = delta;
        return citation.type === 'web_search_result_location' && citation.url
            ? [cited([{ title: citation.title ?? null, url: citation.url }])]
            : [];
    }

    private start(index: number, block: z.infer<typeof blockSchema>) {
        if (block.type === 'server_tool_use') {
            if (!webSearchName.test(block.name)) {
                return [];
            }
            this.calls.set(index, { id: block.id, input: '' });
            return [search(block.id, block.input?.query ?? null, [])];
        }
        const results = z.array(resultSchema).safeParse(block.content).data ?? [];
        const sources: SearchSource[] = results.map((result) => ({
            title: result.title ?? null,
            url: result.url,
        }));
        return [search(block.tool_use_id, null, sources)];
    }
}

function search(id: string, query: string | null, sources: SearchSource[]) {
    const note: SearchNote = { id, kind: 'search', query, sources };
    return note;
}

function cited(sources: SearchSource[]) {
    const note: SearchNote = { kind: 'cited', sources };
    return note;
}

function queryOf(input: string) {
    if (input === '') {
        return null;
    }
    try {
        return inputSchema.safeParse(JSON.parse(input)).data?.query ?? null;
    } catch {
        return null;
    }
}

const webSearchName = /(^|:)web_search$/u;

const inputSchema = z.looseObject({ query: z.string().optional() });

const resultSchema = z.looseObject({ title: z.string().nullish(), url: z.string() });

const blockSchema = z.discriminatedUnion('type', [
    z.looseObject({
        id: z.string(),
        input: inputSchema.optional(),
        name: z.string(),
        type: z.literal('server_tool_use'),
    }),
    z.looseObject({
        content: z.unknown(),
        tool_use_id: z.string(),
        type: z.literal('web_search_tool_result'),
    }),
]);

const eventSchema = z.discriminatedUnion('type', [
    z.looseObject({ type: z.literal('message_start') }),
    z.looseObject({
        content_block: blockSchema,
        index: z.number(),
        type: z.literal('content_block_start'),
    }),
    z.looseObject({
        delta: z.discriminatedUnion('type', [
            z.looseObject({ partial_json: z.string(), type: z.literal('input_json_delta') }),
            z.looseObject({
                citation: z.looseObject({
                    title: z.string().nullish(),
                    type: z.string(),
                    url: z.string().nullish(),
                }),
                type: z.literal('citations_delta'),
            }),
        ]),
        index: z.number(),
        type: z.literal('content_block_delta'),
    }),
    z.looseObject({ index: z.number(), type: z.literal('content_block_stop') }),
]);
