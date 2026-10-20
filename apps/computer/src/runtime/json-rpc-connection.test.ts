import { expect, test } from 'bun:test';
import { JsonRpcConnectionClosedError, JsonRpcRequestError } from './json-rpc.ts';
import { JsonRpcConnection, JsonRpcHandlerError } from './json-rpc-connection.ts';

function connection() {
    const written: Record<string, unknown>[] = [];
    const acp = new JsonRpcConnection({
        write: (line) => {
            written.push(JSON.parse(line));
            return Promise.resolve();
        },
    });
    const reply = (message: Record<string, unknown>) =>
        acp.receiveLine(JSON.stringify({ jsonrpc: '2.0', ...message }));
    return { acp, reply, written };
}

test('correlates responses to requests by id, in any order', async () => {
    const { acp, reply, written } = connection();
    const first = acp.request('initialize', { protocolVersion: 1 });
    const second = acp.request('session/new', { cwd: '/w' });

    expect(written.map((message) => [message.id, message.method])).toEqual([
        [1, 'initialize'],
        [2, 'session/new'],
    ]);
    reply({ id: 2, result: { sessionId: 's-1' } });
    reply({ id: 1, result: { protocolVersion: 1 } });
    expect(await first).toEqual({ protocolVersion: 1 });
    expect(await second).toEqual({ sessionId: 's-1' });
});

test('a JSON-RPC error rejects with its code, data, and the detail ACP agents put in data', async () => {
    const { acp, reply } = connection();
    const pending = acp.request('session/load', {});
    reply({
        error: {
            code: -32_603,
            data: { code: 'FS_NOT_FOUND', detail: 'gone' },
            message: 'Path not found.',
        },
        id: 1,
    });

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JsonRpcRequestError);
    expect(error).toMatchObject({
        code: -32_603,
        data: { code: 'FS_NOT_FOUND' },
        method: 'session/load',
    });
    expect((error as Error).message).toBe('session/load failed: Path not found.: gone');
});

test('notifications reach listeners; malformed lines are reported, not thrown', () => {
    const { acp, reply } = connection();
    const seen: unknown[] = [];
    const invalid: string[] = [];
    acp.onNotification((method, params) => seen.push([method, params]));
    acp.onInvalidLine((line) => invalid.push(line));

    reply({ method: 'session/update', params: { sessionId: 's' } });
    acp.receiveLine('not json');
    acp.receiveLine('{"jsonrpc":"1.0","method":"x"}');
    acp.receiveLine('   ');

    expect(seen).toEqual([['session/update', { sessionId: 's' }]]);
    expect(invalid).toEqual(['not json', '{"jsonrpc":"1.0","method":"x"}']);
});

test('answers agent requests with the handler result or its JSON-RPC error', async () => {
    const { acp, reply, written } = connection();
    acp.setRequestHandler((method) => {
        if (method === 'session/request_permission') {
            return { outcome: { optionId: 'allow', outcome: 'selected' } };
        }
        throw new JsonRpcHandlerError({ code: -32_601, message: `no ${method}` });
    });

    reply({ id: 'perm-1', method: 'session/request_permission', params: {} });
    reply({ id: 'fs-1', method: 'fs/read_text_file', params: {} });
    await Bun.sleep(0);

    expect(written).toHaveLength(2);
    expect(written).toContainEqual({
        id: 'perm-1',
        jsonrpc: '2.0',
        result: { outcome: { optionId: 'allow', outcome: 'selected' } },
    });
    expect(written).toContainEqual({
        error: { code: -32_601, message: 'no fs/read_text_file' },
        id: 'fs-1',
        jsonrpc: '2.0',
    });
});

test('an unhandled agent request is method-not-found', async () => {
    const { reply, written } = connection();
    reply({ id: 7, method: 'terminal/create', params: {} });
    await Bun.sleep(0);

    expect(written).toEqual([
        { error: { code: -32_601, message: 'Method not found' }, id: 7, jsonrpc: '2.0' },
    ]);
});

test('close fails every waiting request once, and later requests fail fast', async () => {
    const { acp, reply } = connection();
    const pending = acp.request('session/prompt', {});
    acp.close(new Error('Grok exited (code 101)'));
    acp.close(new Error('second close is ignored'));
    reply({ id: 1, result: { stopReason: 'end_turn' } });

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(JsonRpcConnectionClosedError);
    expect((error as Error).message).toBe('session/prompt failed: Grok exited (code 101)');
    await expect(acp.request('initialize', {})).rejects.toThrow('Grok exited (code 101)');
    await expect(acp.notify('session/cancel', {})).rejects.toThrow('Grok exited (code 101)');
});

test('a local abort stops waiting and drops the late answer', async () => {
    const { acp, reply } = connection();
    const abort = new AbortController();
    const pending = acp.request('session/load', {}, { signal: abort.signal });
    abort.abort(new Error('startup deadline'));
    reply({ id: 1, result: {} });

    await expect(pending).rejects.toThrow('startup deadline');
});

test('a failed write fails its request', async () => {
    const acp = new JsonRpcConnection({ write: () => Promise.reject(new Error('EPIPE')) });

    await expect(acp.request('initialize', {})).rejects.toThrow('EPIPE');
});
