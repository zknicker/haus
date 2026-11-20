import { afterEach, describe, expect, test } from 'bun:test';
import { cleanups, drainCleanups } from '../../../runner-test-server.ts';
import { isGroundingRedirect, resolveRedirects } from './grounding-redirects.ts';

afterEach(drainCleanups);

function redirectServer() {
    const server = Bun.serve({
        fetch(request) {
            const path = new URL(request.url).pathname;
            if (request.method === 'HEAD' && path === '/moved') {
                return new Response(null, { headers: { location: '/page' }, status: 302 });
            }
            if (path === '/hangs') {
                return new Promise<Response>(() => undefined);
            }
            if (request.method === 'HEAD' && path === '/elsewhere') {
                return Response.redirect('https://haus.example/releases', 301);
            }
            return new Response('here', { status: 200 });
        },
        port: 0,
    });
    cleanups.push(() => server.stop(true));
    return `http://127.0.0.1:${server.port}`;
}

describe('grounding redirects', () => {
    test('only Gemini grounding links count as redirects to resolve', () => {
        expect(
            isGroundingRedirect(
                'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbF9wXE'
            )
        ).toBe(true);
        expect(isGroundingRedirect('https://haus.example/releases')).toBe(false);
    });

    test('each redirect resolves to where it leads, and a link that does not redirect stays out', async () => {
        const origin = redirectServer();
        const closed = Bun.serve({ fetch: () => new Response(), port: 0 });
        const unreachable = `http://127.0.0.1:${closed.port}/moved`;
        closed.stop(true);

        const resolved = await resolveRedirects(
            [`${origin}/moved`, `${origin}/elsewhere`, `${origin}/stays`, unreachable],
            undefined
        );

        expect(Object.fromEntries(resolved)).toEqual({
            [`${origin}/elsewhere`]: 'https://haus.example/releases',
            [`${origin}/moved`]: `${origin}/page`,
        });
    });

    test('a redirect that never answers times out and the others still resolve', async () => {
        const origin = redirectServer();

        const resolved = await resolveRedirects([`${origin}/hangs`, `${origin}/moved`], undefined, {
            timeoutMs: 50,
        });

        expect(Object.fromEntries(resolved)).toEqual({ [`${origin}/moved`]: `${origin}/page` });
    });

    test('an aborted search stops instead of keeping its redirects', async () => {
        const origin = redirectServer();
        const controller = new AbortController();
        controller.abort(new Error('turn stopped'));

        await expect(resolveRedirects([`${origin}/moved`], controller.signal)).rejects.toThrow(
            'turn stopped'
        );
    });
});
