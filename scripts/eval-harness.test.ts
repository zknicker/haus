import { describe, expect, test } from 'bun:test';
import { createDevAuthSession } from './eval-harness.mjs';
import { syncEvalHumanIdentity } from './eval-human-identity.mjs';

describe('eval harness', () => {
    test('headless evaluations establish the human Server identity', async () => {
        const calls: Array<{ input: unknown; path: string }> = [];
        await syncEvalHumanIdentity(async (path: string, input: unknown) => {
            calls.push({ input, path });
        }, 'srv_test');

        expect(calls).toEqual([
            {
                input: { name: 'Haus Evaluator', serverId: 'srv_test' },
                path: 'member.syncIdentity',
            },
        ]);
    });

    test('local auth refreshes an opaque access session and revokes its resume token at cleanup', async () => {
        const calls: Array<{ body: Record<string, string>; path: string }> = [];
        const fetcher: typeof fetch = async (input, init) => {
            const url = new URL(input.toString());
            const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
            calls.push({ body, path: url.pathname });
            if (url.pathname === '/auth/dev/session') {
                const second = Boolean(body.sessionToken);
                return Response.json({
                    session: {
                        accessToken: second ? 'rotated-access-token' : 'short-access-token',
                        expiresAt: new Date(Date.now() + (second ? 60_000 : 1000)).toISOString(),
                    },
                    sessionToken: 'stable-resume-token',
                });
            }
            return new Response(null, { status: 204 });
        };

        const auth = await createDevAuthSession('http://127.0.0.1:8090', fetcher);
        await expect(auth.getToken()).resolves.toBe('rotated-access-token');
        await auth.close();

        expect(calls).toEqual([
            { body: { client: 'desktop' }, path: '/auth/dev/session' },
            {
                body: { client: 'desktop', sessionToken: 'stable-resume-token' },
                path: '/auth/dev/session',
            },
            {
                body: { client: 'desktop', sessionToken: 'stable-resume-token' },
                path: '/auth/logout',
            },
        ]);
    });

    test('development auth refuses a non-loopback Server URL', async () => {
        await expect(createDevAuthSession('https://haus.chat', fetch)).rejects.toThrow(/loopback/u);
    });
});
