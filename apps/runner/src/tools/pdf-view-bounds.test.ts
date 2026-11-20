import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { answerWithPdf, imageFacts } from './pdf-view.test-support.ts';

afterEach(drainCleanups);

const scan = { height: 1568, mimeType: 'image/jpeg', type: 'image', width: 1211 } as const;
const textPage = { height: 1568, mimeType: 'image/png', type: 'image', width: 1211 } as const;

describe('a PDF view bounds its page images and its text', () => {
    test('a view renders the first 5 scanned pages and names the rest', async () => {
        expect(await viewed('twelve-pages-scanned.pdf')).toEqual([
            text(['[Page 1 of 12]', 'Scanned archive: twelve pages', '', blank(2)]),
            scan,
            text([blank(3)]),
            scan,
            text([blank(4)]),
            scan,
            text([blank(5)]),
            scan,
            text([blank(6)]),
            scan,
            text([
                blank(7),
                '',
                blank(8),
                '',
                blank(9),
                '',
                blank(10),
                '',
                blank(11),
                '',
                blank(12),
                '',
                'Pages 7-12 also have figures or scanned content. view_range [7, 7] shows a page with its image, and a range shows up to 10 pages with their images.',
            ]),
        ]);
    });

    test('a view_range renders up to 10 of its pages, text pages included, and names the rest', async () => {
        const parts = await viewed('twelve-pages-scanned.pdf', [1, -1]);

        expect(parts.slice(0, 3)).toEqual([
            text(['[Page 1 of 12]', 'Scanned archive: twelve pages']),
            textPage,
            text([blank(2)]),
        ]);
        expect(parts.filter((part) => part.type === 'image')).toEqual([
            textPage,
            ...Array.from({ length: 9 }, () => scan),
        ]);
        expect(parts.at(-1)).toEqual(
            text([
                blank(11),
                '',
                blank(12),
                '',
                'Pages 11-12 are shown without images, because a view shows up to 10 page images. Use view_range [11, 12] to see them.',
            ])
        );
    });

    test('a view shows whole pages up to the text cap and continues by page', async () => {
        const parts = await viewed('long-text.pdf');
        const shown = parts.map((part) => (part.type === 'text' ? part.text.split('\n') : []));

        expect(parts.map((part) => part.type)).toEqual(['text']);
        expect(shown[0]?.filter((line) => line.startsWith('['))).toEqual([
            '[Page 1 of 3]',
            '[Page 2 of 3]',
            '[Showing pages 1-2 of 3. Use view_range [3, -1] to continue.]',
        ]);
        expect(shown[0]?.slice(699, 704)).toEqual([
            'p1 l699',
            'p1 l700',
            '',
            '[Page 2 of 3]',
            'p2 l1',
        ]);
    });
});

async function viewed(fixture: string, viewRange?: readonly [number, number]) {
    const { run, server } = await startedRun();
    const outcome = run.tools.edit(
        'toolu_bounds',
        { command: 'view', path: fixture, ...(viewRange ? { view_range: viewRange } : {}) },
        live()
    );
    await answerWithPdf(server, 'toolu_bounds', fixture);
    const { content, isError } = await outcome;
    expect(isError).toBe(false);
    return content.map(imageFacts);
}

function blank(page: number) {
    return `[Page ${page} of 12]\n(No text on this page.)`;
}

function text(lines: readonly string[]) {
    return { text: lines.join('\n'), type: 'text' } as const;
}
