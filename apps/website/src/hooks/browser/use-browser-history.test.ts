import { expect, test } from 'bun:test';
import { mergeBrowserHistory } from './use-browser-history.ts';

test('local browser history deduplicates visited addresses, updates titles, and caps retention', () => {
    const previous = Array.from({ length: 50 }, (_, index) => ({
        title: `Page ${index}`,
        url: `https://example.com/${index}`,
    }));
    const result = mergeBrowserHistory(previous, [
        { title: 'Updated page', url: 'https://example.com/5' },
        { title: 'New page', url: 'https://example.com/new' },
    ]);
    expect(result).toHaveLength(50);
    expect(result.slice(0, 2)).toEqual([
        { title: 'New page', url: 'https://example.com/new' },
        { title: 'Updated page', url: 'https://example.com/5' },
    ]);
    expect(result.filter((entry) => entry.url === 'https://example.com/5')).toHaveLength(1);
});
