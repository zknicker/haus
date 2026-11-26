import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileReadRunner, fileWriteRunner, imageMediaType, viewImageRunner } from './files.ts';
import { inlinePayloads, type OperationResult } from './operation.ts';
import { operationSession } from './operation-session.test-support.ts';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

let testDir = '';

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'haus-files-'));
});

afterEach(async () => {
    await rm(testDir, { force: true, recursive: true });
});

function context(signal = new AbortController().signal) {
    return {
        agentId: 'agent_files',
        cwd: testDir,
        env: { HOME: testDir },
        invocationId: 'invocation_files',
        logPath: join(testDir, 'invocation.log'),
        payloads: inlinePayloads,
        signal,
        timeoutMs: 60_000,
        ...operationSession(),
    };
}

function text(outcome: OperationResult['outcome'], body: string) {
    return { outcome, output: { kind: 'text' as const, text: body }, truncated: false };
}

function inline(bytes: Uint8Array, mediaType: string) {
    return { base64: Buffer.from(bytes).toString('base64'), kind: 'inline' as const, mediaType };
}

describe('image detection', () => {
    test('recognizes png, jpeg, gif, and webp by their magic bytes', () => {
        expect(
            [
                png,
                Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
                Buffer.from('GIF89a...'),
                Buffer.from('RIFF\0\0\0\0WEBPVP8 '),
                Buffer.from('plain text'),
            ].map((bytes) => imageMediaType(bytes))
        ).toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp', null]);
    });
});

describe('view-image', () => {
    test('returns the image bytes with their media type', async () => {
        await writeFile(join(testDir, 'shot.png'), png);
        expect(await viewImageRunner({ kind: 'view-image', path: 'shot.png' }, context())).toEqual({
            outcome: 'completed' as const,
            output: inline(png, 'image/png'),
            truncated: false,
        });
    });

    test('finds a macOS screenshot named with a narrow no-break space before PM', async () => {
        await writeFile(join(testDir, 'Screenshot at 1.00.00\u202FPM.png'), png);
        const result = await viewImageRunner(
            { kind: 'view-image', path: 'Screenshot at 1.00.00 PM.png' },
            context()
        );
        expect(result.outcome).toBe('completed');
    });

    test('refuses an image over 5 MiB', async () => {
        const large = Buffer.alloc(5 * 1024 * 1024 + 1);
        png.copy(large);
        await writeFile(join(testDir, 'large.png'), large);
        expect(await viewImageRunner({ kind: 'view-image', path: 'large.png' }, context())).toEqual(
            text('failed', 'Image is 5.0MB; the limit is 5 MiB.')
        );
    });

    test('refuses a file that is not an image', async () => {
        await writeFile(join(testDir, 'notes.png'), 'not really a png');
        expect(await viewImageRunner({ kind: 'view-image', path: 'notes.png' }, context())).toEqual(
            text('failed', 'notes.png is not a PNG, JPEG, GIF, or WebP image.')
        );
    });

    test('names the error code for a missing file', async () => {
        expect(await viewImageRunner({ kind: 'view-image', path: 'gone.png' }, context())).toEqual(
            text('failed', 'Could not read file: gone.png. Error code: ENOENT.')
        );
    });
});

describe('file-read', () => {
    test('returns the bytes, typed as an image when they are one', async () => {
        await writeFile(join(testDir, 'data.bin'), 'secret');
        await writeFile(join(testDir, 'shot.png'), png);
        expect(
            await fileReadRunner({ kind: 'file-read', maxBytes: 100, path: 'data.bin' }, context())
        ).toEqual({
            outcome: 'completed' as const,
            output: inline(Buffer.from('secret'), 'application/octet-stream'),
            truncated: false,
        });
        expect(
            (
                await fileReadRunner(
                    { kind: 'file-read', maxBytes: 100, path: 'shot.png' },
                    context()
                )
            ).output
        ).toEqual(inline(png, 'image/png'));
    });

    test('refuses a file over the byte limit, naming both sizes', async () => {
        await writeFile(join(testDir, 'data.bin'), 'twelve bytes');
        expect(
            await fileReadRunner({ kind: 'file-read', maxBytes: 5, path: 'data.bin' }, context())
        ).toEqual(text('failed', 'data.bin is 12 bytes; the limit is 5 bytes.'));
    });
});

describe('file-write', () => {
    test('writes the bytes with the requested mode, creating parent directories', async () => {
        const operation = {
            bytes: inline(Buffer.from('#!/bin/sh\n'), 'text/plain'),
            kind: 'file-write' as const,
            mode: 0o750,
            path: 'bin/run.sh',
        };
        expect(await fileWriteRunner(operation, context())).toEqual(
            text('completed', 'Wrote 10 bytes to bin/run.sh.')
        );
        const path = join(testDir, 'bin', 'run.sh');
        expect(await readFile(path, 'utf-8')).toBe('#!/bin/sh\n');
        expect((await stat(path)).mode & 0o777).toBe(0o750);
    });

    test('writes nothing when the bytes cannot be fetched', async () => {
        const operation = {
            bytes: {
                attachmentId: 'attachment_1',
                kind: 'attachment' as const,
                mediaType: 'image/png',
                sha256: 'a'.repeat(64),
                sizeBytes: 2_000_000,
            },
            kind: 'file-write' as const,
            mode: 0o644,
            path: 'out.png',
        };
        expect(await fileWriteRunner(operation, context())).toEqual(
            text(
                'failed',
                'Could not fetch the bytes for out.png: This Computer cannot download invocation payloads. Nothing was written.'
            )
        );
        expect(await readdir(testDir)).toEqual([]);
    });

    test('writes nothing once the invocation is cancelled', async () => {
        await writeFile(join(testDir, 'out.txt'), 'original');
        const operation = {
            bytes: inline(Buffer.from('replacement'), 'text/plain'),
            kind: 'file-write' as const,
            mode: 0o644,
            path: 'out.txt',
        };
        expect(await fileWriteRunner(operation, context(AbortSignal.abort('cancel')))).toEqual(
            text('cancelled', 'Stopped before writing out.txt. Nothing was written.')
        );
        expect(await readFile(join(testDir, 'out.txt'), 'utf-8')).toBe('original');
        expect(await readdir(testDir)).toEqual(['out.txt']);
    });
});
