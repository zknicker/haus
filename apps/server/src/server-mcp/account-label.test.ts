import { expect, test } from 'bun:test';
import type { McpPreset } from '@haus/api';
import { resolveAccountLabel } from './account-label.ts';
import { makeClient } from './runtime-test-fixtures.ts';

// github-mcp-server's get_me: MarshalledTextResult(MinimalUser) — JSON in one text block.
const getMeText = {
    content: [
        {
            text: JSON.stringify({
                id: 1,
                login: 'zknicker',
                profile_url: 'https://github.com/zknicker',
            }),
            type: 'text',
        },
    ],
};

function label(
    call: () => Promise<unknown>,
    { preset = 'github', tools = ['get_me'] }: { preset?: McpPreset | null; tools?: string[] } = {}
) {
    const { client, state } = makeClient('github-mcp-server', { call });
    const signal = new AbortController().signal;
    const resolved = resolveAccountLabel(client, { preset, signal, timeout: 5000, tools });
    return { resolved, state };
}

test('GitHub labels the account with the get_me login from JSON text', async () => {
    const { resolved, state } = label(() => Promise.resolve(getMeText));
    expect(await resolved).toBe('zknicker');
    expect(state.callRequests).toMatchObject([{ name: 'get_me', options: { timeout: 5000 } }]);
});

test('GitHub prefers structuredContent when the server returns it', async () => {
    const { resolved } = label(() =>
        Promise.resolve({ content: [], structuredContent: { login: 'octocat' } })
    );
    expect(await resolved).toBe('octocat');
});

test('GitHub falls back to the server name when get_me is absent, errors, or has no login', async () => {
    const fallbacks = [
        label(() => Promise.resolve(getMeText), { tools: ['list_issues'] }),
        label(() => Promise.reject(new Error('upstream down'))),
        label(() => Promise.resolve({ ...getMeText, isError: true })),
        label(() => Promise.resolve({ content: [{ text: 'not json', type: 'text' }] })),
        label(() => Promise.resolve({ content: [{ text: '{"login":""}', type: 'text' }] })),
    ];
    for (const { resolved } of fallbacks) {
        expect(await resolved).toBe('github-mcp-server');
    }
    expect(fallbacks[0]?.state.callRequests).toEqual([]);
});

test('connections without a label reader never call a tool', async () => {
    for (const preset of [null, 'merchbase'] as const) {
        const { resolved, state } = label(() => Promise.resolve(getMeText), { preset });
        expect(await resolved).toBe('github-mcp-server');
        expect(state.callRequests).toEqual([]);
    }
});
