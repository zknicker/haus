// Ported from botiverse/raft-source packages/daemon/src/drivers/runtimeSession.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import { CodexConnection, CodexProcessExitedError, CodexRpcError } from './codex-connection.ts';
import { createLineDecoder } from './line-decoder.ts';
import { classifyWireMessage } from './protocol.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';

describe('Codex wire', () => {
    test('a UTF-8 character split across chunks decodes whole', () => {
        const lines: string[] = [];
        const decoder = createLineDecoder((line) => lines.push(line));
        const bytes = new TextEncoder().encode('{"text":"héllo 👋"}\n');
        const split = bytes.indexOf(0xf0) + 2;
        decoder.push(bytes.slice(0, split));
        decoder.push(bytes.slice(split));
        expect(lines).toEqual(['{"text":"héllo 👋"}']);
    });

    test('a JSON-RPC line split across chunks parses only once complete', () => {
        const lines: string[] = [];
        const decoder = createLineDecoder((line) => lines.push(line));
        decoder.push(new TextEncoder().encode('{"id":1,"res'));
        expect(lines).toEqual([]);
        decoder.push(new TextEncoder().encode('ult":{}}\r\n{"method":"a"}\n\n{"method":"b"}'));
        expect(lines).toEqual(['{"id":1,"result":{}}', '{"method":"a"}']);
        decoder.end();
        expect(lines.at(-1)).toBe('{"method":"b"}');
    });

    test('wire messages classify by shape', () => {
        expect(classifyWireMessage({ id: 1, result: null })).toEqual({
            id: 1,
            kind: 'response',
            result: null,
        });
        expect(classifyWireMessage({ error: { message: 'x' }, id: 'a' })?.kind).toBe(
            'error-response'
        );
        expect(classifyWireMessage({ id: 2, method: 'm', params: {} })?.kind).toBe(
            'server-request'
        );
        expect(classifyWireMessage({ method: 'm' })?.kind).toBe('notification');
        expect(classifyWireMessage({ message: 'capacity', type: 'error' })?.kind).toBe('foreign');
        expect(classifyWireMessage([1])).toBeNull();
    });

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
        expect(error).toBeInstanceOf(CodexRpcError);
        expect((error as CodexRpcError).message).toBe('bad');
    });

    test('an exit fails pending and later requests once, with stderr', async () => {
        const fake = new FakeAppServer({ 'thread/start': () => 'hold' });
        const connection = new CodexConnection(
            fake,
            () => ({}),
            () => undefined
        );
        const pending = connection.request('thread/start', {}).catch((caught: unknown) => caught);
        fake.crash(3);
        const error = await pending;
        expect(error).toBeInstanceOf(CodexProcessExitedError);
        expect((error as Error).message).toBe(
            'The Codex app-server exited (exit code 3). stderr: fake stderr'
        );
        expect(connection.alive).toBe(false);
        await expect(connection.request('turn/start', {})).rejects.toBe(error);
    });

    test('a line that is not JSON, or a response to nothing, is reported, not dropped', async () => {
        const fake = new FakeAppServer();
        const invalid: string[] = [];
        new CodexConnection(
            fake,
            () => ({}),
            (line) => invalid.push(line)
        );
        fake.raw('Codex says hi');
        fake.emit({ id: 99, result: {} });
        expect(invalid).toEqual(['Codex says hi', '{"id":99,"kind":"response","result":{}}']);
    });
});
