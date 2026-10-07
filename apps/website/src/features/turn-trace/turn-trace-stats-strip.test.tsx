import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentActivityTurn } from '../members/agent-profile/agent-activity-turns.ts';
import { TurnTracePresentation } from './turn-trace.tsx';
import { complexTurn } from './turn-trace-claude-fixtures.ts';

test('a strip host states the totals once, as one muted line above the steps', () => {
    const markup = renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            presentation={{ journal: complexTurn, kind: 'available' }}
            stripAction={<button type="button">View in #product</button>}
            summary={summaryTurn}
            totalsPlacement="strip"
        />
    );
    assert.doesNotMatch(markup, /data-trace-footer/);
    assert.equal(markup.match(/data-trace-strip/g)?.length, 1);
    // The journal's totals replace the summary's words on the same line.
    assert.doesNotMatch(markup, /Ran 3 sub-agents/);
    const strip = markup.slice(markup.indexOf('data-trace-strip'), markup.indexOf('trace-row'));
    const parts = [...strip.matchAll(/<span(?: class="([^"]*)")?>([^<·]+)<\/span>/g)].map(
        (match) => match[2]
    );
    assert.deepEqual(parts, ['1m 25s', '12 calls', '3 sub-agents', '3 failed', 'Done']);
    assert.match(strip, /class="text-danger">3 failed</);
});

test('without the journal, the strip line states the turn summary so its action still has a home', () => {
    for (const access of ['summary', 'journal'] as const) {
        const markup = renderToStaticMarkup(
            <TurnTracePresentation
                access={access}
                isPending={access === 'journal'}
                presentation={null}
                stripAction={<button type="button">View in #product</button>}
                summary={summaryTurn}
                totalsPlacement="strip"
            />
        );
        const strip = markup.slice(markup.indexOf('data-trace-strip'));
        const parts = [...strip.matchAll(/<span(?: class="([^"]*)")?>([^<·]+)<\/span>/g)].map(
            (match) => match[2]
        );
        assert.deepEqual(parts, ['32s', 'Ran 3 sub-agents', 'sent 1 message', 'Done']);
        assert.match(strip, /<button type="button">View in #product<\/button>/);
    }
});

const summaryTurn: AgentActivityTurn = {
    durationMs: 32_000,
    endedAt: at(32),
    events: [],
    failureKind: null,
    kind: 'settled',
    messageCount: 1,
    operationCount: 3,
    operations: [{ category: 'delegating', completed: 3, failed: 0, interrupted: 0 }],
    outputProduced: true,
    runId: 'run_summary',
    startedAt: at(0),
    status: 'completed',
    trigger: null,
};

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}
