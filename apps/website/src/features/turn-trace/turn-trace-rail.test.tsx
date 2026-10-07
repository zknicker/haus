import assert from 'node:assert/strict';
import test from 'node:test';
import type * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TraceElbow, TraceGroup, TraceNested, traceBranchClass } from './turn-trace-depth.tsx';
import { TraceLine, TraceRow } from './turn-trace-row.tsx';
import { TurnTraceSteps } from './turn-trace-steps-view.tsx';
import { call, journal } from './turn-trace-test-fixtures.ts';
import { buildTurnTraceView } from './turn-trace-view.ts';

const railPattern = /<span[^>]*data-trace-rail[^>]*>/g;
const elbowPattern = /<span[^>]*data-trace-elbow[^>]*>/g;

test('closed groups draw no rail: the rail lives in the opened panel', () => {
    const view = buildTurnTraceView(
        journal(
            'run-rail',
            ['00:00.000', '00:05.000'],
            [
                call('read-1', 'read', ['00:01.000', '00:01.200'], { path: 'a.ts' }),
                call('read-2', 'read', ['00:01.300', '00:01.500'], { path: 'b.ts' }),
            ]
        ),
        [],
        Date.parse('2026-10-06T17:00:10.000Z')
    );
    const markup = renderToStaticMarkup(<TurnTraceSteps steps={view.steps} />);

    assert.match(markup, /Read 2 files/);
    assert.doesNotMatch(markup, /data-trace-rail/);
});

test('each child of an opened group hangs off its rail by a square elbow, nested groups their own', () => {
    const branch = (label: string, nested?: React.ReactNode) => (
        <div className={traceBranchClass}>
            <TraceRow bars={[]} line={<TraceLine icon={[]} label={label} />} />
            {nested}
            <TraceElbow at="row" />
        </div>
    );
    const markup = renderToStaticMarkup(
        <TraceGroup>
            <TraceNested>
                {branch(
                    'Read a.ts',
                    <TraceGroup>
                        <TraceNested>{branch('Read b.ts')}</TraceNested>
                    </TraceGroup>
                )}
                {branch('Read c.ts')}
            </TraceNested>
        </TraceGroup>
    );

    const rails = markup.match(railPattern) ?? [];
    const elbows = markup.match(elbowPattern) ?? [];
    // One stretch of rail and one elbow per child: the nested child's first.
    assert.equal(rails.length, 3);
    assert.equal(elbows.length, 3);
    // Children of the outer group step 1.25rem in; the nested group's another.
    assert.match(rails[0] ?? '', /--trace-depth:2;--trace-indent:2.5rem/);
    assert.match(rails[1] ?? '', /--trace-depth:1;--trace-indent:1.25rem/);
    assert.match(rails[2] ?? '', /--trace-depth:1;--trace-indent:1.25rem/);
    for (const rail of rails) {
        assert.match(rail, /aria-hidden="true"/);
        // Each stretch sits one branch step out, at the group row's icon, and
        // runs across the list's gap; the last child's hides for its └.
        assert.match(rail, /inset-inline-start:calc\(var\(--trace-lead, 0rem\).*- 1.25rem/);
        assert.match(rail, /bg-separator/);
        assert.match(rail, /-bottom-px/);
        assert.match(rail, /\[:last-child&gt;&amp;\]:hidden/);
    }
    for (const elbow of elbows) {
        assert.match(elbow, /border-separator border-b/);
        assert.match(elbow, /\[:last-child&gt;&amp;\]:border-s/);
        assert.match(elbow, /--trace-arm:calc\(1.25rem - var\(--spacing\) \* 2.5 - 0.5px\)/);
    }
});

test('rows outside an opened group draw no elbow', () => {
    const markup = renderToStaticMarkup(
        <TraceNested>
            <div className={traceBranchClass}>
                <TraceRow bars={[]} line={<TraceLine icon={[]} label="Read a.ts" />} />
                <TraceElbow at="row" />
            </div>
        </TraceNested>
    );

    assert.doesNotMatch(markup, /data-trace-rail|data-trace-elbow/);
    // A plain nesting (a log turn's steps) keeps the 0.75rem step.
    assert.match(markup, /--trace-indent:0.75rem/);
});
