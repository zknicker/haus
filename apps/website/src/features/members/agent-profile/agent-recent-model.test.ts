import { expect, test } from 'bun:test';
import { recentRowLine, turnSummaries } from './agent-recent-model.ts';

const request = { kind: 'text', place: '#product', text: 'Can you fix the badge?' } as const;

test('a Recent row reads the turn summary first line ahead of its request', () => {
    expect(
        recentRowLine({
            outcome: 'Replied',
            summary: '\n  Traced the sidebar badge count to the cached chat row.\nMore detail.',
            title: request,
        })
    ).toEqual({ muted: false, text: 'Traced the sidebar badge count to the cached chat row.' });
});

test('without a summary a Recent row reads its request, else its muted outcome', () => {
    expect(recentRowLine({ outcome: 'Replied', summary: null, title: request })).toEqual({
        muted: false,
        text: 'Can you fix the badge?',
    });
    expect(recentRowLine({ outcome: 'Replied', summary: '  ', title: { kind: 'none' } })).toEqual({
        muted: true,
        text: 'Replied',
    });
    expect(
        recentRowLine({
            outcome: 'Replied',
            summary: undefined,
            title: { kind: 'pending', place: null },
        })
    ).toEqual({ muted: false, text: '' });
});

test('summaries are keyed by run', () => {
    const summaries = turnSummaries([
        { runId: 'run_a', summary: 'Split the unread rollup.' },
        { runId: 'run_b', summary: null },
    ]);
    expect(summaries.get('run_a')).toBe('Split the unread rollup.');
    expect(summaries.get('run_b')).toBeNull();
    expect(turnSummaries(undefined).size).toBe(0);
});
