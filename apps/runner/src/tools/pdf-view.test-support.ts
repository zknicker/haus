import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { startedRun } from '../runner-test-server.ts';

type Part =
    | { readonly text: string; readonly type: 'text' }
    | { readonly data: string; readonly mimeType: string; readonly type: 'image' };

export async function answerWithPdf(
    server: Awaited<ReturnType<typeof startedRun>>['server'],
    toolCallId: string,
    fixture: string
) {
    expect(await server.frame('invocation-request')).toMatchObject({
        operation: { edit: { command: 'view' }, kind: 'edit' },
        toolCallId,
    });
    server.answer({
        outcome: 'completed',
        output: {
            base64: (await readFile(join(import.meta.dir, 'fixtures', fixture))).toString('base64'),
            kind: 'inline',
            mediaType: 'application/pdf',
        },
        runId: 'run_1',
        seq: 0,
        toolCallId,
    });
}

export function imageFacts(part: Part) {
    if (part.type === 'text') {
        return part;
    }
    const bytes = Buffer.from(part.data, 'base64');
    return { ...encodedSize(bytes, part.mimeType), mimeType: part.mimeType, type: part.type };
}

function encodedSize(bytes: Buffer, mimeType: string) {
    if (mimeType === 'image/png') {
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
    }
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    let offset = 2;
    while (offset < bytes.length) {
        const marker = bytes[offset + 1] ?? 0;
        if (marker >= 0xc0 && marker <= 0xc2) {
            return {
                height: bytes.readUInt16BE(offset + 5),
                width: bytes.readUInt16BE(offset + 7),
            };
        }
        offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    throw new Error('The JPEG has no start-of-frame marker.');
}
