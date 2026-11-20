import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readPdf } from './pdf-pages.ts';
import { manyPagePdf } from './pdf-view.test-support.ts';
import { pdfLimits, pdfView, viewPdf } from './pdf-view.ts';

const scanned = () => readFile(join(import.meta.dir, 'fixtures', 'twelve-pages-scanned.pdf'));

describe('a PDF view bounds its work', () => {
    test('a view_range reads the text of only the pages it selects', async () => {
        const extracted = await readPdf(
            manyPagePdf(400),
            new AbortController().signal,
            async (pdf) => {
                await pdfView(pdf, [5, 6]);
                return pdf.extracted;
            }
        );

        expect(extracted).toEqual([5, 6]);
    });

    test('a PDF over the page cap is refused before any page is read', async () => {
        expect(
            await viewPdf(manyPagePdf(pdfLimits.maxPages + 1), undefined, {
                signal: new AbortController().signal,
            })
        ).toEqual({
            content: [{ text: 'PDF has 2001 pages; the limit is 2000.', type: 'text' }],
            isError: true,
        });
    });

    test('the timeout firing mid-render settles promptly with the refusal text', async () => {
        const bytes = new Uint8Array(await scanned());
        const started = performance.now();
        const whole = await viewPdf(bytes.slice(), [1, 10], {
            signal: new AbortController().signal,
        });
        const wholeMs = performance.now() - started;

        const cutStarted = performance.now();
        const cut = await viewPdf(bytes.slice(), [1, 10], {
            signal: new AbortController().signal,
            timeoutMs: 10,
        });

        expect(whole.isError).toBe(false);
        expect(cut).toEqual({
            content: [
                {
                    text: 'Reading this PDF took longer than 0.01 seconds, so view stopped.',
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(performance.now() - cutStarted).toBeLessThan(wholeMs * 0.75);
    });

    test('a stop mid-render rejects with the stop instead of finishing the pages', async () => {
        const stop = new AbortController();
        const viewing = viewPdf(new Uint8Array(await scanned()), [1, 10], { signal: stop.signal });
        stop.abort(new Error('stopped by the user'));

        await expect(viewing).rejects.toThrow('stopped by the user');
    });
});
