import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentHoverTurn, HoverLogRow, HoverTimedRow } from './agent-hover-rows.tsx';
import type { AgentActivityTurn } from './agent-profile/agent-activity-turns.ts';

const numericColumn =
    /class="[^"]*w-14 shrink-0 whitespace-nowrap text-right text-muted tabular-nums/;

test('live and sub-agent lines put their length in the numeric column', () => {
    const live = renderToStaticMarkup(
        <HoverTimedRow className="text-accent" line={{ elapsed: '1m 24s', label: 'Running' }} />
    );
    expect(text(live)).toEqual(['Running', '1m 24s']);
    expect(live).toMatch(numericColumn);
    const unknown = renderToStaticMarkup(
        <HoverTimedRow className="text-accent" line={{ elapsed: null, label: 'Running' }} />
    );
    expect(text(unknown)).toEqual(['Running']);
});

test('a log line keeps its label left and its time in the column', () => {
    const markup = renderToStaticMarkup(
        <HoverLogRow
            line={{ id: 'e1', label: 'Edited files', occurredAt: startedAt, time: '12:00 pm' }}
        />
    );
    expect(text(markup)).toEqual(['Edited files', '12:00 pm']);
    expect(markup).toMatch(numericColumn);
});

test('a recent turn stacks request over place and outcome, length over age', () => {
    const markup = renderToStaticMarkup(
        <AgentHoverTurn
            row={{ count: 1, latest: turn(), since: startedAt }}
            title={{ kind: 'text', place: 'DM', text: 'Ship it' }}
        />
    );
    const [title, outcome, length] = text(markup);
    expect([title, outcome, length]).toEqual(['Ship it', 'DM · Sent 1 message', '11m']);
});

test('a recent turn with no visible request is one outcome line, status explicit', () => {
    const markup = renderToStaticMarkup(
        <AgentHoverTurn
            row={{ count: 2, latest: turn({ status: 'interrupted' }), since: startedAt }}
            title={{ kind: 'none' }}
        />
    );
    expect(text(markup).slice(0, 3)).toEqual(['Sent 1 message', 'Interrupted 2×', '11m']);
});

const startedAt = '2026-10-06T12:00:00.000Z';

function text(markup: string): string[] {
    return [...markup.matchAll(/>([^<>]+)</g)].map((match) => match[1] ?? '');
}

function turn(overrides: Partial<Extract<AgentActivityTurn, { kind: 'settled' }>> = {}) {
    return {
        durationMs: 660_000,
        endedAt: startedAt,
        events: [],
        failureKind: null,
        kind: 'settled',
        messageCount: 1,
        operationCount: 0,
        operations: [],
        outputProduced: true,
        runId: 'run_one',
        startedAt,
        status: 'completed',
        trigger: null,
        ...overrides,
    } satisfies AgentActivityTurn;
}
