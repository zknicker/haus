// Public surface is limited to authenticated, synthetic prototype callbacks.
import { timingSafeEqual } from 'node:crypto';
import type { Fixture } from './haus-fixture.ts';
import { answerInput, consumption, type RequestStore, registration } from './request-store.ts';

export function startBridge(
    port: number,
    callbackToken: string,
    store: RequestStore,
    fixture: Fixture
) {
    const receipts: unknown[] = [];
    const bridge = Bun.serve({
        hostname: '127.0.0.1',
        port,
        async fetch(request) {
            try {
                const url = new URL(request.url);
                const token =
                    url.pathname === '/answer'
                        ? (request.headers.get('authorization')?.replace(/^Bearer /u, '') ?? '')
                        : (request.headers.get('x-haus-cloud-run') ?? '');
                const left = Buffer.from(token);
                const right = Buffer.from(callbackToken);
                const native = left.length === right.length && timingSafeEqual(left, right);
                if (url.pathname === '/answer' && request.method === 'POST') {
                    if (
                        request.headers.get('host') !== `127.0.0.1:${port}` ||
                        !(await fixture.authorize(token))
                    ) {
                        return new Response('Unauthorized', { status: 401 });
                    }
                    const { id, answer } = answerInput.parse(await request.json());
                    return Response.json(await store.answer(id, answer));
                }
                if (!native) {
                    return new Response('Unauthorized', { status: 401 });
                }
                return await nativeCallback(request, url);
            } catch (error) {
                return Response.json({ error: String(error) }, { status: 409 });
            }
        },
    });
    return { bridge, receipts };
    async function nativeCallback(request: Request, url: URL) {
        if (url.pathname === '/question' && request.method === 'POST') {
            const stored = await store.register(registration.parse(await request.json()));
            await fixture.notify(stored.id, {
                inputRequestId: stored.id,
                questions: stored.questions,
                sessionId: stored.sessionId,
            });
            return Response.json(stored);
        }
        if (url.pathname === '/request' && request.method === 'GET') {
            if (!url.searchParams.get('session')) {
                throw new Error('Native session identity required.');
            }
            return Response.json(
                await store.read(
                    url.searchParams.get('id') ?? '',
                    url.searchParams.get('session') ?? ''
                )
            );
        }
        if (url.pathname === '/consumed' && request.method === 'POST') {
            const body = consumption.parse(await request.json());
            const stored = await store.resolve(body.id, body);
            receipts.push({
                event: 'consumed',
                at: new Date().toISOString(),
                request: stored,
            });
            return Response.json(stored);
        }
        if (url.pathname === '/event' && request.method === 'POST') {
            receipts.push(await request.json());
            return Response.json({ ok: true });
        }
        return new Response('Not found', { status: 404 });
    }
}
