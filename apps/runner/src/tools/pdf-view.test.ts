import { afterEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { HausToolBinding } from '../claude/haus-tools.ts';
import { PiToolBinding } from '../pi/pi-tools.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

const fixture = join(
    dirname(fileURLToPath(import.meta.resolve('@haus/computer/package.json'))),
    'src/invocations/fixtures/two-pages.pdf'
);
const pagedText = [
    '     1\t[Page 1 of 2]',
    '     2\tHaus fixture page one: amber otter 417',
    '     3\t',
    '     4\t[Page 2 of 2]',
    '     5\tSecond page: copper heron 902',
].join('\n');

describe('view of a PDF on the runner', () => {
    test('a Pi model gets the extracted text with page markers', async () => {
        const { run, server } = await startedRun();
        const binding = new PiToolBinding();
        binding.bind(run.tools);

        const viewed = binding.run('call_pdf', BACKGROUND_CONTEXT, (tools, signal) =>
            tools.edit('call_pdf', { command: 'view', path: 'report.pdf' }, signal)
        );
        await answerWithPdf(server, 'call_pdf');

        expect(await viewed).toEqual({
            isError: false,
            output: [{ text: pagedText, type: 'text' }],
        });
    });

    test('a Claude model gets the same text in its MCP tool result', async () => {
        const { run, server } = await startedRun();
        const binding = new HausToolBinding();
        binding.bind(run.tools);

        const viewed = binding.run(
            { _meta: { 'claudecode/toolUseId': 'toolu_pdf' }, signal: live() },
            (tools, id, signal) =>
                tools.edit(id, { command: 'view', path: 'report.pdf', view_range: [4, 5] }, signal)
        );
        await answerWithPdf(server, 'toolu_pdf');

        expect(await viewed).toEqual({
            content: [
                {
                    text: '     4\t[Page 2 of 2]\n     5\tSecond page: copper heron 902',
                    type: 'text',
                },
            ],
        });
    });

    test('bytes that are not a readable PDF say so', async () => {
        const { run, server } = await startedRun();

        const viewed = run.tools.edit('toolu_bad', { command: 'view', path: 'bad.pdf' }, live());
        await server.frame('invocation-request');
        server.answer({
            outcome: 'completed',
            output: {
                base64: Buffer.from('%PDF-1.4 truncated').toString('base64'),
                kind: 'inline',
                mediaType: 'application/pdf',
            },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_bad',
        });

        expect(await viewed).toEqual({
            content: [
                {
                    text: 'Could not read the text of this PDF. Invalid PDF structure.',
                    type: 'text',
                },
            ],
            invocation: 'completed',
            isError: true,
        });
    });
});

async function answerWithPdf(
    server: Awaited<ReturnType<typeof startedRun>>['server'],
    toolCallId: string
) {
    expect(await server.frame('invocation-request')).toMatchObject({
        operation: { edit: { command: 'view', path: 'report.pdf' }, kind: 'edit' },
        toolCallId,
    });
    server.answer({
        outcome: 'completed',
        output: {
            base64: (await readFile(fixture)).toString('base64'),
            kind: 'inline',
            mediaType: 'application/pdf',
        },
        runId: 'run_1',
        seq: 0,
        toolCallId,
    });
}
