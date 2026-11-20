import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { drainCleanups, live, runCredential, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');

describe('machine results reach the model', () => {
    test('an edit input that is not a whole editor command is refused before anything is dispatched', async () => {
        const { run, server } = await startedRun();

        const refused = await run.tools.edit(
            'toolu_1',
            { command: 'str_replace', new_str: 'world', path: 'notes.md' },
            live()
        );
        const viewed = run.tools.edit('toolu_2', { command: 'view', path: 'notes.md' }, live());

        expect(refused).toEqual({
            content: [
                {
                    text: 'The str_replace input is invalid. Nothing ran.\n✖ Invalid input: expected string, received undefined\n  → at old_str',
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(await server.frame('invocation-request')).toMatchObject({
            seq: 0,
            toolCallId: 'toolu_2',
        });
        server.answer({
            outcome: 'completed',
            output: { base64: pngBase64, kind: 'inline', mediaType: 'image/png' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_2',
        });
        expect(await viewed).toEqual({
            content: [{ data: pngBase64, mimeType: 'image/png', type: 'image' }],
            invocation: 'completed',
            isError: false,
        });
    });

    test('an image that arrives as an attachment reference is read with the run credential and shown', async () => {
        const image = Buffer.concat([Buffer.from(pngBase64, 'base64'), Buffer.alloc(800_000, 3)]);
        const { run, server } = await startedRun({
            '/api/agent/invocation-payloads/att_shot': () =>
                new Response(image, { headers: { 'content-type': 'image/png' } }),
        });

        const viewed = run.tools.edit('toolu_1', { command: 'view', path: 'shot.png' }, live());
        await server.frame('invocation-request');
        server.answer({
            outcome: 'completed',
            output: { ...reference('att_shot', image), mediaType: 'image/png' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });

        expect(await viewed).toEqual({
            content: [{ data: image.toString('base64'), mimeType: 'image/png', type: 'image' }],
            invocation: 'completed',
            isError: false,
        });
        expect(server.requests).toEqual([
            {
                authorization: `Bearer ${runCredential}`,
                body: null,
                dispatchId: null,
                method: 'GET',
                path: '/api/agent/invocation-payloads/att_shot',
            },
        ]);
    });

    test('a payload whose bytes differ from its reference is never handed on', async () => {
        const { run, server } = await startedRun({
            '/api/agent/invocation-payloads/att_big': () => new Response('tampered'),
        });

        const upload = run.tools.bash(
            'toolu_1',
            { command: 'haus attachment upload --path ./big.bin' },
            live()
        );
        await server.frame('invocation-request');
        server.answer({
            outcome: 'completed',
            output: reference('att_big', Buffer.from('original')),
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });

        expect(await upload).toEqual({
            content: [
                {
                    text: './big.bin was not read. The machine stored 8 bytes of application/octet-stream, but they could not be read: The payload the Server returned does not match its reference.',
                    type: 'text',
                },
            ],
            isError: true,
        });
    });
});

function reference(attachmentId: string, bytes: Buffer) {
    return {
        attachmentId,
        kind: 'attachment' as const,
        mediaType: 'application/octet-stream',
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sizeBytes: bytes.byteLength,
    };
}
