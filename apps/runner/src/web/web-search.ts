import { webSearchNotConfigured } from '@haus/agent-prompt';
import type { ToolOutcome } from '../run-context.ts';
import { truncateForModel } from './page-text.ts';

export interface SearchResult {
    readonly publishedAt?: string;
    readonly snippet: string;
    readonly title: string;
    readonly url: string;
}

export interface SearchAnswer {
    readonly answer: string | null;
    readonly results: readonly SearchResult[];
}

export interface SearchBackend {
    search(input: { count: number; query: string; signal: AbortSignal }): Promise<SearchAnswer>;
}

export const defaultSearchCount = 10;

export async function webSearch(input: {
    backend: SearchBackend | null;
    count?: number;
    query: string;
    signal: AbortSignal;
}) {
    if (!input.backend) {
        return answer(webSearchNotConfigured, true);
    }
    try {
        const found = await input.backend.search({
            count: input.count ?? defaultSearchCount,
            query: input.query,
            signal: input.signal,
        });
        return answer(truncateForModel(formatSearch(input.query, found)), false);
    } catch (error) {
        input.signal.throwIfAborted();
        return answer(
            `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
            true
        );
    }
}

export function formatSearch(query: string, found: SearchAnswer) {
    if (found.results.length === 0 && !found.answer) {
        return `No results for "${query}".`;
    }
    const sources = found.results.map((result, index) =>
        [
            `${index + 1}. ${result.title}`,
            `   ${result.url}`,
            ...(result.publishedAt ? [`   Published ${result.publishedAt}`] : []),
            ...(result.snippet ? [`   ${result.snippet.replace(/\s+/gu, ' ').trim()}`] : []),
        ].join('\n')
    );
    return [
        ...(found.answer ? [found.answer.trim()] : []),
        ...(sources.length > 0 ? [`Sources:\n${sources.join('\n')}`] : []),
    ].join('\n\n');
}

function answer(text: string, isError: boolean) {
    return { content: [{ text, type: 'text' }], isError } satisfies ToolOutcome;
}
