import { expect, test } from 'bun:test';
import { narrowMcpToolResult } from './tool-result.ts';

const structured = { orders: [{ id: 'ord_1', total: 42 }] };
const textCopy = { text: JSON.stringify(structured), type: 'text' };

test('a structured result keeps the structured value and drops its duplicate text copy', () => {
    expect(
        narrowMcpToolResult({
            content: [textCopy],
            isError: false,
            structuredContent: structured,
        })
    ).toEqual({ content: [], isError: false, structuredContent: structured });
});

test('a text-only result is unchanged', () => {
    const result = { content: [{ text: 'Plain prose.', type: 'text' }], isError: false };
    expect(narrowMcpToolResult(result)).toBe(result);
});

test('a structured result keeps its non-text blocks beside the structured value', () => {
    const image = { data: 'aGk=', mimeType: 'image/png', type: 'image' };
    const link = { name: 'chart', type: 'resource_link', uri: 'https://example.test/chart' };
    expect(
        narrowMcpToolResult({ content: [textCopy, image, link], structuredContent: structured })
    ).toEqual({ content: [image, link], structuredContent: structured });
});

test('an error result keeps its message even when it also carries structured content', () => {
    const failure = {
        content: [{ text: 'The upstream rejected that order id.', type: 'text' }],
        isError: true,
        structuredContent: { code: 'not_found' },
    };
    expect(narrowMcpToolResult(failure)).toBe(failure);
});

test('results without a structured value or a content array pass through untouched', () => {
    const empty = { content: [textCopy], structuredContent: null };
    const legacy = { toolResult: structured };
    expect(narrowMcpToolResult(empty)).toBe(empty);
    expect(narrowMcpToolResult(legacy)).toBe(legacy);
    expect(narrowMcpToolResult(null)).toBe(null);
});
