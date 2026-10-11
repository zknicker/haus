import { describe, expect, it } from 'bun:test';
import { mcpRequestHeaders } from './preset-headers.ts';

const githubToolsets = 'default,actions,notifications,code_security,dependabot';

describe('mcpRequestHeaders', () => {
    it('asks GitHub for Actions, notifications, and security toolsets alongside its defaults', () => {
        expect(mcpRequestHeaders('github', {})).toEqual({ 'X-MCP-Toolsets': githubToolsets });
    });

    it('keeps stored headers and leaves other connections untouched', () => {
        const stored = { Authorization: 'Bearer token' };
        expect(mcpRequestHeaders('github', stored)).toEqual({
            Authorization: 'Bearer token',
            'X-MCP-Toolsets': githubToolsets,
        });
        expect(mcpRequestHeaders('merchbase', stored)).toEqual(stored);
        expect(mcpRequestHeaders(null, stored)).toEqual(stored);
    });
});
