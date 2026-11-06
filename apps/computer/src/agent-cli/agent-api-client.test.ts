import { expect, test } from 'bun:test';
import * as z from 'zod';
import { AgentApiClient } from './agent-api-client.ts';

const context = {
    agentId: 'agt_wren',
    serverUrl: 'http://127.0.0.1:18790',
    token: `grta_${'a'.repeat(43)}`,
    tokenFile: '/tmp/token',
};

test('allows Server writes to queue longer than the local proxy fast path', async () => {
    const fetcher = (async (
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
    ) => {
        return await new Promise<Response>((resolve, reject) => {
            const timer = setTimeout(() => resolve(Response.json({ ok: true })), 1600);
            init?.signal?.addEventListener(
                'abort',
                () => {
                    clearTimeout(timer);
                    reject(init.signal?.reason);
                },
                { once: true }
            );
        });
    }) as typeof fetch;
    const client = new AgentApiClient(context, fetcher);

    await expect(
        client.request('/api/agent/claims/claim', z.object({ ok: z.boolean() }), {
            body: { numbers: [1], target: '#coordination' },
            method: 'POST',
        })
    ).resolves.toEqual({ ok: true });
}, 3000);

test('names the real cause when a 200 response does not match the expected schema', async () => {
    const fetcher = (async () => Response.json({ ok: 'not-a-boolean' })) as unknown as typeof fetch;
    const client = new AgentApiClient(context, fetcher);

    await expect(
        client.request('/api/agent/tasks/claim', z.object({ ok: z.boolean() }))
    ).rejects.toMatchObject({
        code: 'UNEXPECTED_RESPONSE_SHAPE',
        message: expect.stringContaining('"ok"'),
    });
});

test('preserves retryable structured errors from a Server 5xx response', async () => {
    const fetcher = (async () =>
        Response.json(
            {
                code: 'AVATAR_PROVIDER_FAILED',
                message: 'The image provider could not generate an avatar.',
                retryable: true,
            },
            { status: 502 }
        )) as unknown as typeof fetch;
    const client = new AgentApiClient(context, fetcher);

    await expect(
        client.request('/api/agent/agents/avatar', z.object({ ok: z.boolean() }), {
            body: { agent: '@orbit', concept: 'fox' },
            method: 'POST',
        })
    ).rejects.toMatchObject({
        code: 'AVATAR_PROVIDER_FAILED',
        options: { retryable: true },
    });
});
