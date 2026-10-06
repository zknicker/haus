import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { TurnRowContent } from './agent-turn-row.tsx';
import type { TurnRowTitle } from './agent-turn-row-model.ts';

test('a titled row stacks request over outcome and length over start time', () => {
    const markup = render(settled({ durationMs: 660_000 }), {
        kind: 'text',
        place: 'DM',
        text: 'Ship the changelog',
    });
    expect(text(markup)).toEqual(['Ship the changelog', 'DM', '1 message', '11m', time()]);
    // One fixed, unwrapping numeric column carries both numbers.
    expect(markup).toMatch(/class="[^"]*w-18[^"]*whitespace-nowrap[^"]*tabular-nums/);
    expect(markup).not.toContain('Failed');
});

test('a row without a visible request is its outcome alone, never repeated', () => {
    const markup = render(settled(), { kind: 'none' });
    expect(text(markup)).toEqual(['1 message', '1m', time()]);
});

test('a failed row keeps its status explicit, before the numbers', () => {
    const markup = render(settled({ status: 'failed' }), { kind: 'none' }, 3);
    expect(text(markup)).toEqual(['1 message', 'Failed', '3×', '1m', time()]);
});

test('a running row shows Working and a live length', () => {
    const markup = render(
        { ...base(), kind: 'active', startedAt: new Date(Date.now() - 42_000).toISOString() },
        { kind: 'pending', place: '#product' }
    );
    expect(markup).toContain('Working');
    expect(markup).toMatch(/>4[23]s</);
});

function render(turn: AgentActivityTurn, title: TurnRowTitle, count = 1) {
    return renderToStaticMarkup(
        <TurnRowContent row={{ count, latest: turn, since: turn.startedAt }} title={title} />
    );
}

/** Leaf text in document order, ignoring icons and empty slots. */
function text(markup: string): string[] {
    return [...markup.matchAll(/>([^<>]+)</g)].map((match) => match[1] ?? '');
}

const startedAt = '2026-10-06T12:00:00.000Z';

function time() {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true, minute: '2-digit' })
        .format(new Date(startedAt))
        .toLowerCase();
}

function base() {
    return {
        durationMs: 60_000,
        events: [],
        messageCount: 1,
        operationCount: 0,
        operations: [],
        runId: 'run_one',
        startedAt,
        trigger: null,
    };
}

function settled(overrides: Partial<Extract<AgentActivityTurn, { kind: 'settled' }>> = {}) {
    return {
        ...base(),
        endedAt: startedAt,
        failureKind: null,
        kind: 'settled',
        outputProduced: true,
        status: 'completed',
        ...overrides,
    } satisfies AgentActivityTurn;
}
