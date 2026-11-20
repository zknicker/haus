import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
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

export async function darkPixels(
    part: Part,
    region: {
        readonly bottom: number;
        readonly left: number;
        readonly right: number;
        readonly top: number;
    }
) {
    if (part.type === 'text') {
        throw new Error(`Expected an image, got text: ${part.text}`);
    }
    const image = await loadImage(Buffer.from(part.data, 'base64'));
    const context = createCanvas(image.width, image.height).getContext('2d');
    context.drawImage(image, 0, 0);
    const width = region.right - region.left;
    const { data } = context.getImageData(
        region.left,
        region.top,
        width,
        region.bottom - region.top
    );
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) {
        const [red = 255, green = 255, blue = 255, alpha = 0] = data.subarray(index, index + 4);
        if (alpha >= 128 && Math.max(red, green, blue) < 128) {
            dark += 1;
        }
    }
    return dark;
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
