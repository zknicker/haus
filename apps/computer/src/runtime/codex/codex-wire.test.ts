// Ported from botiverse/raft-source packages/daemon/src/drivers/runtimeSession.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import { JsonRpcConnectionClosedError, JsonRpcRequestError } from '../json-rpc.ts';
import { CodexConnection, CodexProcessExitedError } from './codex-connection.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';

describe('Codex wire', () => {
    test('a request resolves with its result and rejects with its JSON-RPC error', async () => {
        const fake = new FakeAppServer({
            'config/read': () => ({ error: { code: -1, message: 'bad' } }),
        });
        const connection = new CodexConnection(
            fake,
            () => ({}),
            () => undefined
        );
        expect(await connection.request('initialize', {})).toMatchObject({
            userAgent: 'codex/0.159.0',
        });
        const error = await connection
            .request('config/read', {})
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(JsonRpcRequestError);
        expect((error as JsonRpcRequestError).detail).toBe('bad');
        expect((error as JsonRpcRequestError).message).toBe('config/read failed: bad');
    });

    test('an exit fails pending and later requests, with the exit status and stderr', async () => {
        const fake = new FakeAppServer({ 'thread/start': () => 'hold' });
        const connection = new CodexConnection(
            fake,
            () => ({}),
            () => undefined
        );
        const pending = connection.request('thread/start', {}).catch((caught: unknown) => caught);
        fake.crash(3);
        const error = await pending;
        expect(error).toBeInstanceOf(JsonRpcConnectionClosedError);
        expect((error as Error).cause).toBeInstanceOf(CodexProcessExitedError);
        expect((error as Error).message).toBe(
            'thread/start failed: The Codex app-server exited (exit code 3). stderr: fake stderr'
        );
        expect(connection.alive).toBe(false);
        await expect(connection.request('turn/start', {})).rejects.toThrow(
            'turn/start failed: The Codex app-server exited (exit code 3)'
        );
    });

    test('foreign JSON lines reach the listener; non-JSON and stray responses are reported', () => {
        const fake = new FakeAppServer();
        const invalid: string[] = [];
        const inbound: unknown[] = [];
        const connection = new CodexConnection(
            fake,
            () => ({}),
            (line) => invalid.push(line)
        );
        connection.listen((message) => inbound.push(message));
        fake.raw('Codex says hi');
        fake.emit({ id: 99, result: {} });
        fake.raw(JSON.stringify({ message: 'capacity', type: 'error' }));
        expect(invalid).toHaveLength(2);
        expect(invalid[0]).toBe('Codex says hi');
        expect(JSON.parse(invalid[1] ?? '{}')).toMatchObject({ id: 99, result: {} });
        expect(inbound).toEqual([
            { kind: 'foreign', value: { message: 'capacity', type: 'error' } },
        ]);
    });
});
