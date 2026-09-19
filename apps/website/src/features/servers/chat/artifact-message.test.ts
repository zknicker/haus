import { expect, test } from 'bun:test';
import { splitArtifactFences } from './artifact-message.tsx';

test('extracts valid artifact cards while preserving surrounding chat text', () => {
    expect(
        splitArtifactFences(
            'Here is the report.\n```artifact\n{"path":"reports/summary.html","title":"Summary"}\n```\nDone.'
        ).map(({ key: _, ...segment }) => segment)
    ).toEqual([
        { end: 20, kind: 'text', start: 0, text: 'Here is the report.\n' },
        {
            kind: 'artifact',
            props: { path: 'reports/summary.html', title: 'Summary' },
        },
        { end: 91, kind: 'text', start: 85, text: '\nDone.' },
    ]);
});

test('cards an artifact fence the model glued to its prose and to its JSON', () => {
    const content =
        'The report is ready.```artifact\n{"path":"reports/summary.html","title":"Summary"}```\nOpen it any time.';
    const segments = splitArtifactFences(content).map(({ key: _, ...segment }) => segment);

    expect(segments).toEqual([
        { end: 20, kind: 'text', start: 0, text: 'The report is ready.' },
        {
            kind: 'artifact',
            props: { path: 'reports/summary.html', title: 'Summary' },
        },
        { end: content.length, kind: 'text', start: 84, text: '\nOpen it any time.' },
    ]);
});

test('keeps malformed artifact fences visible as ordinary message text', () => {
    const content = '```artifact\n{"path":"notes.txt"}\n```';

    expect(splitArtifactFences(content).map(({ key: _, ...segment }) => segment)).toEqual([
        { end: content.length, kind: 'text', start: 0, text: content },
    ]);
});
