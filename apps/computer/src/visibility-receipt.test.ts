import { afterEach, expect, test } from 'bun:test';
import { visibilityReceipt } from './visibility-receipt.ts';

let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => server?.stop(true));

test('a composed receipt asks the Server for exact visibility only', async () => {
    const received: unknown[] = [];
    server = Bun.serve({
        fetch: async (request) => {
            received.push({
                authorization: request.headers.get('authorization'),
                body: await request.json(),
                path: new URL(request.url).pathname,
            });
            return Response.json({ accepted: ['msg_wake0001'] });
        },
        port: 0,
    });
    const identity = { chatId: 'cht_product', id: 'msg_wake0001', sequence: 7 };

    const accepted = await visibilityReceipt(`http://127.0.0.1:${server.port}`, 'runner-token')(
        [identity],
        AbortSignal.timeout(1000)
    );

    expect(accepted).toEqual([identity]);
    expect(received).toEqual([
        {
            authorization: 'Bearer runner-token',
            body: { composed: true, messages: [identity] },
            path: '/api/agent/events/visible',
        },
    ]);
});
