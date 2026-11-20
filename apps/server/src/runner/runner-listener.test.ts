import { afterEach, expect, test } from 'bun:test';
import { runnerSocketPath } from '@haus/api';
import Fastify from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import { startRunnerListener } from './runner-listener.ts';

const app = Fastify();
let close: (() => Promise<void>) | undefined;
afterEach(async () => {
    await close?.();
    await app.close();
});

test('the runner listener serves only the runner socket, the Agent API and health', async () => {
    app.get('/healthz', () => ({ status: 'ok' }));
    app.get('/api/agent/server', () => ({ agent: true }));
    app.get('/api/haus/session', () => ({ human: true }));
    app.get('/', () => 'app');
    await app.ready();
    const runnerSockets = new WebSocketServer({ noServer: true });
    app.server.on('upgrade', (request, socket, head) => {
        runnerSockets.handleUpgrade(request, socket, head, (connection) => connection.close());
    });
    const listener = await startRunnerListener(app, { host: '127.0.0.1', port: 0 });
    close = listener.close;
    const status = async (path: string) =>
        (await fetch(`http://127.0.0.1:${listener.port}${path}`)).status;

    expect(await status('/healthz')).toBe(200);
    expect(await status('/api/agent/server')).toBe(200);
    expect(await status('/api/haus/session')).toBe(404);
    expect(await status('/')).toBe(404);

    const refused = new WebSocket(`ws://127.0.0.1:${listener.port}/trpc`);
    const failure = await new Promise<string>((resolve) => {
        refused.on('error', () => resolve('error'));
        refused.on('open', () => resolve('open'));
    });
    expect(failure).toBe('error');
    const runner = new WebSocket(`ws://127.0.0.1:${listener.port}${runnerSocketPath}`);
    const opened = await new Promise<string>((resolve) => {
        runner.on('error', () => resolve('error'));
        runner.on('open', () => resolve('open'));
    });
    expect(opened).toBe('open');
    runnerSockets.close();
});
