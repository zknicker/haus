import { expect, test } from 'bun:test';
import { startLoopbackProxy } from './proxy.ts';

test('counts only committed messages as produced output', async () => {
    let committed = 0;
    let state: 'held' | 'sent' = 'held';
    const upstream = Bun.serve({
        fetch() {
            return Response.json({ state });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const request = () =>
            fetch(`${proxy.url}/api/agent/messages/send`, {
                body: '{}',
                headers: {
                    authorization: 'Bearer local-token',
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
        proxy.setOnCommittedSend(() => {
            committed += 1;
        });
        expect((await request()).status).toBe(200);
        expect(proxy.sendCount()).toBe(0);
        expect(committed).toBe(0);

        state = 'sent';
        expect((await request()).status).toBe(200);
        expect(proxy.sendCount()).toBe(1);
        expect(committed).toBe(1);
        proxy.clearRunnerToken();
        proxy.setRunnerToken('next-run-token');
        expect((await request()).status).toBe(200);
        expect(committed).toBe(1);
    } finally {
        proxy.close();
        upstream.stop(true);
    }
});

test('reports the committed Chat and whether the send carried --done', async () => {
    const sends: unknown[] = [];
    const upstream = Bun.serve({
        fetch() {
            return Response.json({ message: { chat_id: 'cht_general' }, state: 'sent' });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        proxy.setOnCommittedSend((send) => sends.push(send));
        for (const body of ['{"done":true}', '{}']) {
            await fetch(`${proxy.url}/api/agent/messages/send`, {
                body,
                headers: {
                    authorization: 'Bearer local-token',
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
        }
        expect(sends).toEqual([
            { chatId: 'cht_general', done: true },
            { chatId: 'cht_general', done: false },
        ]);
    } finally {
        proxy.close();
        upstream.stop(true);
    }
});
