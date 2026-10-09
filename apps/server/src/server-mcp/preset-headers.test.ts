import { describe, expect, it } from 'bun:test';
import { mcpRequestHeaders } from './preset-headers.ts';

describe('mcpRequestHeaders', () => {
    it('asks GitHub for the Actions toolset alongside its defaults', () => {
        expect(mcpRequestHeaders('github', {})).toEqual({ 'X-MCP-Toolsets': 'default,actions' });
    });

    it('keeps stored headers and leaves other connections untouched', () => {
        const stored = { Authorization: 'Bearer token' };
        expect(mcpRequestHeaders('github', stored)).toEqual({
            Authorization: 'Bearer token',
            'X-MCP-Toolsets': 'default,actions',
        });
        expect(mcpRequestHeaders('merchbase', stored)).toEqual(stored);
        expect(mcpRequestHeaders(null, stored)).toEqual(stored);
    });
});
