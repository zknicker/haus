// Ported from botiverse/raft-source packages/daemon/src/drivers/runtimeSession.test.ts (FSL-1.1-ALv2)
import { expect, test } from 'bun:test';
import { LineDecoder } from './line-decoder.ts';

test('decodes split UTF-8 stdout before line parsing', () => {
    const decoder = new LineDecoder();
    const bytes = Buffer.from(`${JSON.stringify({ text: 'hello 你好' })}\n`, 'utf8');
    const splitAt = bytes.indexOf(Buffer.from('你', 'utf8')[0] as number) + 1;

    expect(decoder.push(bytes.subarray(0, splitAt))).toEqual([]);
    expect(decoder.push(bytes.subarray(splitAt)).map((line) => JSON.parse(line))).toEqual([
        { text: 'hello 你好' },
    ]);
});

test('holds a partial line until its newline and strips CRLF endings', () => {
    const decoder = new LineDecoder();

    expect(decoder.push(Buffer.from('{"a":1}\r\n{"b"'))).toEqual(['{"a":1}']);
    expect(decoder.push(Buffer.from(':2}\n\n'))).toEqual(['{"b":2}', '']);
    expect(decoder.push(Buffer.from('{"tail":true}'))).toEqual([]);
    expect(decoder.end()).toEqual(['{"tail":true}']);
});

test('a line past the limit is a protocol failure, not an unbounded buffer', () => {
    const decoder = new LineDecoder(8);

    expect(() => decoder.push(Buffer.from('0123456789'))).toThrow('exceeded 8 characters');
});
