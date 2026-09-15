import { expect, test } from 'bun:test';
import { mcpCatalogResponse } from './catalog-response.ts';

test('search omits large schemas and describe returns only the requested tool', () => {
    const tools = Array.from({ length: 100 }, (_, index) => ({
        name: `tool_${index}`,
        title: null,
        description: 'Weather',
        inputSchema: { type: 'object', description: 'x'.repeat(20_000) },
    }));
    const search = mcpCatalogResponse(tools, { query: 'weather' });
    expect(search).toHaveProperty('total', 100);
    expect(search.tools).toHaveLength(50);
    expect(JSON.stringify(search).length).toBeLessThan(10_000);
    expect(mcpCatalogResponse(tools, { name: 'tool_3' })).toEqual({ tools: [tools[3]] });
    expect(mcpCatalogResponse(tools, { query: 'missing' })).toEqual({ tools: [], total: 0 });
});
