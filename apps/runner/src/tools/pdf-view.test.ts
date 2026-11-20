import { afterEach, describe, expect, test } from 'bun:test';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { HausToolBinding } from '../claude/haus-tools.ts';
import { PiToolBinding } from '../pi/pi-tools.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { answerWithPdf, darkPixels, imageFacts } from './pdf-view.test-support.ts';

afterEach(drainCleanups);

const scannedPage = { height: 1568, mimeType: 'image/jpeg', type: 'image', width: 1211 } as const;
const figurePage = { height: 1568, mimeType: 'image/png', type: 'image', width: 1211 } as const;

describe('view of a PDF on the runner', () => {
    test('a Pi model gets the text of every page and images of exactly the scanned and figure pages', async () => {
        const { run, server } = await startedRun();
        const binding = new PiToolBinding();
        binding.bind(run.tools);

        const viewed = binding.run('call_pdf', BACKGROUND_CONTEXT, (tools, signal) =>
            tools.edit('call_pdf', { command: 'view', path: 'report.pdf' }, signal)
        );
        await answerWithPdf(server, 'call_pdf', 'text-scan-figure.pdf');
        const { isError, output } = await viewed;

        expect(isError).toBe(false);
        expect(output.map(imageFacts)).toEqual([
            {
                text: [
                    '[Page 1 of 3]',
                    'Quarterly report: amber otter 417',
                    'Revenue grew in every region this quarter.',
                    '',
                    '[Page 2 of 3]',
                    '(No text on this page.)',
                ].join('\n'),
                type: 'text',
            },
            scannedPage,
            { text: '[Page 3 of 3]\nFigure 1: copper heron sales by month', type: 'text' },
            figurePage,
        ]);
    });

    test('a Claude model gets the pages a view_range selects, each with its image', async () => {
        const { run, server } = await startedRun();
        const binding = new HausToolBinding();
        binding.bind(run.tools);

        const viewed = binding.run(
            { _meta: { 'claudecode/toolUseId': 'toolu_pdf' }, signal: live() },
            (tools, id, signal) =>
                tools.edit(id, { command: 'view', path: 'report.pdf', view_range: [2, 2] }, signal)
        );
        await answerWithPdf(server, 'toolu_pdf', 'text-scan-figure.pdf');
        const { content } = await viewed;

        expect(content.map(imageFacts)).toEqual([
            { text: '[Page 2 of 3]\n(No text on this page.)', type: 'text' },
            scannedPage,
        ]);
    });

    test("a page image draws a label set in a standard font the PDF doesn't embed", async () => {
        const { run, server } = await startedRun();

        const viewed = run.tools.edit(
            'toolu_label',
            { command: 'view', path: 'label.pdf', view_range: [1, 1] },
            live()
        );
        await answerWithPdf(server, 'toolu_label', 'helvetica-label.pdf');
        const { content } = await viewed;

        expect(content.map(imageFacts)).toEqual([
            { text: '[Page 1 of 1]\nHAUS LABEL', type: 'text' },
            { height: 1211, mimeType: 'image/png', type: 'image', width: 1568 },
        ]);
        const label = await darkPixels(content[1], {
            bottom: 515,
            left: 140,
            right: 1040,
            top: 380,
        });
        // pdf.js's Liberation Sans draws 25,923; host Helvetica draws 27,938 and a fontless host none.
        expect(label).toBeWithin(25_800, 26_050);
    });

    test('a view_range past the last page names the pages a PDF has', async () => {
        const { run, server } = await startedRun();

        const viewed = run.tools.edit(
            'toolu_range',
            { command: 'view', path: 'report.pdf', view_range: [3, 4] },
            live()
        );
        await answerWithPdf(server, 'toolu_range', 'text-scan-figure.pdf');

        expect(await viewed).toEqual({
            content: [
                {
                    text: 'Invalid view_range [3, 4]: on a PDF it selects pages, from 1 to 3, and an end of -1 runs to the last page.',
                    type: 'text',
                },
            ],
            invocation: 'completed',
            isError: true,
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
