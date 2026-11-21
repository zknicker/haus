import { expect, test } from 'bun:test';
import { claudeHarnessContext } from './claude-context.ts';

test('Claude rows fold into Haus sections, with the compaction buffer setting the threshold', () => {
    const context = claudeHarnessContext(
        {
            categories: [
                {
                    color: 'g',
                    id: 'system_prompt',
                    kind: 'used',
                    name: 'System prompt',
                    tokens: 9000,
                },
                {
                    color: 'p',
                    id: 'system_tools',
                    kind: 'used',
                    name: 'System tools',
                    tokens: 3000,
                },
                { color: 'p', id: 'mcp_tools', kind: 'used', name: 'MCP tools', tokens: 7000 },
                {
                    color: 'p',
                    id: 'mcp_tools_deferred',
                    kind: 'deferred',
                    name: 'MCP tools (deferred)',
                    tokens: 40_000,
                },
                { color: 'b', id: 'messages', kind: 'used', name: 'Messages', tokens: 120_000 },
                { color: 'x', kind: 'used', name: 'Something new', tokens: 500 },
                {
                    color: 'r',
                    id: 'autocompact_buffer',
                    kind: 'buffer',
                    name: 'Autocompact buffer',
                    tokens: 33_000,
                },
                { color: 'w', id: 'free_space', kind: 'free', name: 'Free space', tokens: 27_500 },
            ],
            rawMaxTokens: 200_000,
        },
        1_000_000
    );

    expect(context).toEqual({
        compactAtTokens: 167_000,
        contextWindow: 1_000_000,
        kind: 'counted',
        rows: { conversation: 120_500, memory: 0, skills: 0, systemPrompt: 9000, tools: 10_000 },
    });
});

test('without a reported model window, the measured window stands in', () => {
    const context = claudeHarnessContext({ categories: [], rawMaxTokens: 200_000 }, null);

    expect(context.contextWindow).toBe(200_000);
    expect(context.compactAtTokens).toBe(200_000);
});
