import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TraceGroup, TraceNested } from './turn-trace-grid.tsx';
import { TraceLine, TraceRow } from './turn-trace-row.tsx';
import { TurnTraceSteps } from './turn-trace-steps-view.tsx';
import { call, journal } from './turn-trace-test-fixtures.ts';
import { buildTurnTraceView } from './turn-trace-view.ts';

const railPattern = /<span[^>]*data-trace-rail[^>]*>/g;

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

test('an opened group draws one rail at its own row icon, and a nested group its own', () => {
    const row = (label: string) => (
        <TraceRow bars={[]} line={<TraceLine icon={[]} label={label} />} />
    );
    const markup = renderToStaticMarkup(
        <TraceGroup>
            <TraceNested>
                {row('Read a.ts')}
                <TraceGroup>
                    <TraceNested>{row('Read b.ts')}</TraceNested>
                </TraceGroup>
            </TraceNested>
        </TraceGroup>
    );

    const rails = markup.match(railPattern) ?? [];
    assert.equal(rails.length, 2);
    // Each rail follows its rows and sits at its group row's depth, one step
    // out from them: the nested group's first, then the outer group's.
    assert.match(rails[0] ?? '', /--trace-depth:1/);
    assert.match(rails[1] ?? '', /--trace-depth:0/);
    for (const rail of rails) {
        assert.match(rail, /aria-hidden="true"/);
        assert.match(rail, /inset-inline-start:calc\(var\(--trace-lead, 0rem\)/);
        assert.match(rail, /bg-separator/);
    }
});
