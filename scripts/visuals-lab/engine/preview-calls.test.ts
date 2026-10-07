import { expect, test } from 'bun:test';
import { countPreviewCalls, countPreviewCallsInTrace } from './preview-calls.mjs';

const call = (input: unknown) => ({ input: JSON.stringify(input), name: 'tool' });

test('counts preview runs across runtime input shapes, not help or other commands', () => {
    const trace = [
        call({ command: 'haus visual preview draft.md --width 736 --width 375' }),
        call({ command: ['bash', '-lc', 'cd /w && haus visual preview - <<EOF\n…\nEOF'] }),
        call({ argv: ['haus', 'visual', 'preview', 'draft.md'] }),
        call({ command: 'haus visual preview --help' }),
        call({ file_path: '/w/draft.md' }),
        call({ command: 'haus message send' }),
    ];
    expect(countPreviewCalls(trace)).toBe(3);
});

test('reads a trace file, skipping blank and unparseable lines', () => {
    const text = [
        JSON.stringify(call({ command: 'haus visual preview a.md' })),
        '',
        'not json',
        JSON.stringify({ at: 'now', stderr: 'boom' }),
    ].join('\n');
    expect(countPreviewCallsInTrace(text)).toBe(1);
});
