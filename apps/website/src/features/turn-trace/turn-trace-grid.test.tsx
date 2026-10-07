import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AgentExecutionJournal } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { TurnTraceCallBody } from './turn-trace-call-body.tsx';
import { TurnTraceFooter } from './turn-trace-footer.tsx';
import {
    TraceBody,
    TraceLayoutProvider,
    TraceNested,
    traceGridClass,
    traceRowHoverClass,
    traceTurnHighlightClass,
} from './turn-trace-grid.tsx';
import { TraceRow } from './turn-trace-row.tsx';
import { TurnTraceScopeProvider } from './turn-trace-scope.tsx';
import { TurnTraceSteps } from './turn-trace-steps-view.tsx';
import { call, journal } from './turn-trace-test-fixtures.ts';
import { buildTurnTraceView } from './turn-trace-view.ts';

const tokens = readFileSync(new URL('../../styles/product-tokens.css', import.meta.url), 'utf8');

// A failed sub-agent and its failed child call. Rows stay closed until opened,
// so `render` draws the sub-agent's children one depth in and the failed
// call's body beside the top-level rows: rows at depth 0 and 1, and a body.
const nested: AgentExecutionJournal = journal(
    'run-grid',
    ['00:00.000', '00:30.000'],
    [
        call('read', 'Read', ['00:00.500', '00:01.800'], { file_path: 'README.md' }),
        call(
            'task',
            'Agent',
            ['00:02.000', '00:28.000'],
            { description: 'Count files' },
            {
                status: 'failed',
                subagent: {
                    label: 'Count files',
                    startedAt: '2026-10-06T17:00:02.000Z',
                    status: 'failed',
                },
            }
        ),
        call(
            'child-ok',
            'Bash',
            ['00:03.000', '00:05.000'],
            { command: 'ls' },
            { parentToolCallId: 'task' }
        ),
        call(
            'child-bad',
            'Bash',
            ['00:06.000', '00:09.000'],
            { command: 'find packages -type f | wc -l' },
            { error: 'No such file', parentToolCallId: 'task', status: 'failed' }
        ),
    ]
);

test('every row, at every depth, lays out on the one grid', () => {
    const markup = render(nested);
    const rows = markup.match(/<(?:div|button)[^>]*data-trace-row[^>]*>/g) ?? [];
    assert.ok(rows.length >= 4, `expected rows at two depths, saw ${rows.length}`);
    for (const row of rows) {
        assert.ok(row.includes(traceGridClass), `row off the grid: ${row}`);
    }
    // Depth lives in a custom property the label cell indents by; the row
    // frame itself never moves.
    assert.match(markup, /data-trace-row[^>]*style="--trace-depth:0"/);
    assert.match(markup, /data-trace-row[^>]*style="--trace-depth:1"/);
});

test('the track and duration columns are identical cells at every depth', () => {
    const markup = render(nested);
    const cells = (name: string) =>
        new Set(
            (markup.match(new RegExp(`<span[^>]*data-trace-cell="${name}"[^>]*>`, 'g')) ?? []).map(
                (cell) => cell.replace(/style="[^"]*"/, '')
            )
        );
    assert.equal(cells('track').size, 1);
    assert.equal(cells('duration').size, 1);
    assert.equal(cells('slot').size, 1);
    // Only the label cell indents, by depth.
    assert.match(
        markup,
        /data-trace-cell="label" style="padding-inline-start:calc\(var\(--trace-depth\) \* 0.75rem\)"/
    );
    assert.doesNotMatch(markup, /border-s/);
});

test('every row carries a dotted leader through its track, and bars ring over it', () => {
    const markup = render(nested);
    const rows = markup.match(/data-trace-row/g)?.length ?? 0;
    assert.equal(markup.match(/data-trace-leader/g)?.length, rows);
    assert.match(markup, /shadow-\[0_0_0_2px_var\(--trace-ring\)\]/);
    // Bars say what kind of work ran: a sub-agent is a step, a call a tool.
    assert.match(markup, /data-trace-bar="tool"/);
    assert.match(markup, /data-trace-bar="danger"/);
    assert.match(markup, /bg-trace-tool/);
});

test('a failed row tints whole, with a danger bar and a danger leader', () => {
    const markup = render(nested);
    const failed = markup.match(/<button[^>]*bg-trace-row-danger[^>]*>[\s\S]*?<\/button>/g) ?? [];
    // The failed sub-agent and its failed call.
    assert.equal(failed.length, 2);
    for (const row of failed) {
        assert.match(row, /\[--trace-ring:var\(--trace-row-danger\)\]/);
        assert.match(row, /border-trace-leader-danger/);
        assert.match(row, /bg-danger/);
    }
    assert.match(
        tokens,
        /--trace-row-danger: color-mix\(in oklab, var\(--danger\) \d+%, var\(--trace-ground\)\)/
    );
});

test('the highlight fill wins over the danger tint, so a failed row highlights like its neighbors', () => {
    // Direct hover: failed rows take the same hover fill and ring as any row;
    // the hover variant outranks the resting tint.
    const failed = render(nested).match(/<button[^>]*bg-trace-row-danger[^>]*>/g) ?? [];
    assert.equal(failed.length, 2);
    for (const row of failed) {
        assert.ok(row.includes(traceRowHoverClass), row);
    }
    const leaf = renderToStaticMarkup(
        <TraceLayoutProvider layout="log">
            <TraceRow bars={[]} line="Ran a command" tone="danger" />
        </TraceLayoutProvider>
    );
    assert.match(leaf, /bg-trace-row-danger/);
    assert.ok(leaf.includes(traceRowHoverClass), leaf);
    // Linked highlight: the turn rebinds the danger tint to its own fill, so
    // a failed row's fill and bar ring match the rest of the turn.
    assert.match(traceTurnHighlightClass, /(^| )bg-default( |$)/);
    assert.ok(traceTurnHighlightClass.includes('[--trace-row-danger:var(--default)]'));
    assert.ok(traceTurnHighlightClass.includes('[--trace-ring:var(--default)]'));
});

test('bodies open on the label text, and nested rows never sit inside one', () => {
    const markup = render(nested);
    assert.match(
        markup,
        /data-trace-body="true" style="--trace-depth:0;padding-inline-start:calc\(/
    );
    const bodies = markup.match(/<div[^>]*data-trace-body[\s\S]*?<\/div>/g) ?? [];
    for (const body of bodies) {
        assert.doesNotMatch(body, /data-trace-row/);
    }
    assert.match(markup, /uppercase tracking-wide">Error</);
});

test('bars rescale and pulse only with motion allowed', () => {
    const live = render({
        ...journal(
            'run-live',
            ['00:00.000'],
            [call('live', 'Bash', ['00:01.000'], { command: 'sleep 9' }, { status: 'running' })],
            { status: 'running' }
        ),
    });
    assert.match(
        live,
        /transition-\[left,width\] duration-200 ease-linear motion-reduce:transition-none/
    );
    assert.match(live, /motion-safe:animate-pulse/);
    const settled = render(nested);
    assert.doesNotMatch(settled, /animate-pulse/);
});

test('the footer states each total once, and flips Running to Done', () => {
    const totals = {
        calls: 5,
        callsByKind: {},
        durationMs: 40_000,
        failed: 1,
        images: 0,
        isRunning: true,
        subagents: 1,
    };
    const running = renderToStaticMarkup(<TurnTraceFooter totals={totals} />);
    assert.match(running, /data-trace-stat="Running"[\s\S]*?>40s</);
    assert.doesNotMatch(running, /Done|Images/);
    assert.match(running, /data-trace-stat="Sub-agent"/);
    const done = renderToStaticMarkup(<TurnTraceFooter totals={{ ...totals, isRunning: false }} />);
    assert.match(done, /data-trace-stat="Done"[\s\S]*?>40s</);
    assert.doesNotMatch(done, /Running/);
});

function render(source: AgentExecutionJournal) {
    const trace = renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            presentation={{ journal: source, kind: 'available' }}
        />
    );
    const view = buildTurnTraceView(source, [], Date.parse(source.endedAt ?? source.startedAt));
    const subagent = view.steps.find((step) => step.kind === 'subagent');
    if (!subagent) {
        return trace;
    }
    const failed = subagent.children.find(
        (step) => step.kind === 'call' && step.status === 'failed'
    );
    return (
        trace +
        renderToStaticMarkup(
            <TurnTraceScopeProvider scope={{ axisMs: 30_000, workspace: null }}>
                <TraceNested>
                    <TurnTraceSteps steps={subagent.children} />
                </TraceNested>
                {failed?.kind === 'call' ? (
                    <TraceBody>
                        <TurnTraceCallBody tool={failed.tool} />
                    </TraceBody>
                ) : null}
            </TurnTraceScopeProvider>
        )
    );
}
