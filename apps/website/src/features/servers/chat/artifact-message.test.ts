import { expect, test } from 'bun:test';
import { splitArtifactFences } from './artifact-message.tsx';

test('extracts valid page cards while preserving surrounding chat text', () => {
    expect(
        splitArtifactFences(
            'Here is the report.\n```page\n{"path":"reports/summary.html","title":"Summary"}\n```\nDone.'
        ).map(({ key: _, ...segment }) => segment)
    ).toEqual([
        { end: 20, kind: 'text', start: 0, text: 'Here is the report.\n' },
        {
            kind: 'page',
            props: { path: 'reports/summary.html', title: 'Summary' },
        },
        { end: 87, kind: 'text', start: 81, text: '\nDone.' },
    ]);
});

test('cards a page fence the model glued to its prose and to its JSON', () => {
    const content =
        'The report is ready.```page\n{"path":"reports/summary.html","title":"Summary"}```\nOpen it any time.';
    const segments = splitArtifactFences(content).map(({ key: _, ...segment }) => segment);

    expect(segments).toEqual([
        { end: 20, kind: 'text', start: 0, text: 'The report is ready.' },
        {
            kind: 'page',
            props: { path: 'reports/summary.html', title: 'Summary' },
        },
        { end: content.length, kind: 'text', start: 80, text: '\nOpen it any time.' },
    ]);
});

test('keeps malformed page fences visible as ordinary message text', () => {
    const content = '```page\n{"path":"notes.txt"}\n```';

    expect(splitArtifactFences(content).map(({ key: _, ...segment }) => segment)).toEqual([
        { end: content.length, kind: 'text', start: 0, text: content },
    ]);
});

test('no longer recognizes the retired artifact fence', () => {
    const content = '```artifact\n{"path":"workbench/summary.html","title":"Summary"}\n```';

    expect(splitArtifactFences(content).map(({ key: _, ...segment }) => segment)).toEqual([
        { end: content.length, kind: 'text', start: 0, text: content },
    ]);
});
