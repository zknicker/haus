import { expect, test } from 'bun:test';
import { parseJsonRpcLine } from './json-rpc.ts';

const parse = (value: unknown) => parseJsonRpcLine(JSON.stringify(value));

test('wire messages classify by shape, with or without the jsonrpc member', () => {
    expect(parse({ id: 1, result: null })).toEqual({ id: 1, kind: 'result', result: null });
    expect(parse({ id: 1, jsonrpc: '2.0', result: {} })?.kind).toBe('result');
    expect(parse({ error: { message: 'x' }, id: 'a' })).toEqual({
        error: { code: undefined, data: undefined, message: 'x' },
        id: 'a',
        kind: 'error',
    });
    expect(parse({ id: 2, method: 'm', params: {} })?.kind).toBe('request');
    expect(parse({ method: 'm' })?.kind).toBe('notification');
});

test('a JSON object that is no JSON-RPC message is foreign; anything else is not a message', () => {
    expect(parse({ message: 'capacity', type: 'error' })).toEqual({
        kind: 'foreign',
        value: { message: 'capacity', type: 'error' },
    });
    // An error without an id is the CLI's own line, never a response.
    expect(parse({ error: { message: 'x' }, type: 'error' })?.kind).toBe('foreign');
    expect(parse({ jsonrpc: '1.0', method: 'x' })?.kind).toBe('foreign');
    expect(parse([1])).toBeNull();
    expect(parseJsonRpcLine('not json')).toBeNull();
});
