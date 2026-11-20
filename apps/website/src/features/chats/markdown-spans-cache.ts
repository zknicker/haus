import { readMarkdownSpans } from '@haus/api';

const maxEntries = 256;
const cache = new Map<string, ReturnType<typeof readMarkdownSpans>>();

export function readCachedMarkdownSpans(text: string) {
    const cached = cache.get(text);
    if (cached) {
        cache.delete(text);
        cache.set(text, cached);
        return cached;
    }
    const spans = readMarkdownSpans(text);
    cache.set(text, spans);
    if (cache.size > maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
            cache.delete(oldest);
        }
    }
    return spans;
}
