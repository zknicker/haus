import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';

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

    test('a machine file that arrives as an attachment reference is refused with a note naming it', async () => {
        const { run, server } = await startedRun();

        const upload = run.tools.bash(
            'toolu_1',
            { command: 'haus attachment upload --path ./big.bin' },
            live()
        );
        await server.frame('invocation-request');
        server.answer({
            outcome: 'completed',
            output: {
                attachmentId: 'att_big',
                kind: 'attachment',
                mediaType: 'application/octet-stream',
                sha256: 'a'.repeat(64),
                sizeBytes: 2_000_000,
            },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });

        expect(await upload).toEqual({
            content: [
                {
                    text: './big.bin was not read. The result arrived as attachment att_big (application/octet-stream, 2000000 bytes), which this runner cannot read yet.',
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(server.requests).toEqual([]);
    });
});
