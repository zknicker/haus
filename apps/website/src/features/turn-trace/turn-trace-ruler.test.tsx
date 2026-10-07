import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { type TraceLayout, TraceLayoutProvider } from './turn-trace-grid.tsx';
import { TraceRow } from './turn-trace-row.tsx';
import { TraceRuler } from './turn-trace-ruler.tsx';
import { readTraceScale } from './turn-trace-scale.ts';
import { TurnTraceScopeProvider } from './turn-trace-scope.tsx';

const scale = readTraceScale(32_000);
if (!scale) {
    throw new Error('a 32s turn has a scale');
}

test('a ruler labels its ticks, ends hugging the lane', () => {
    const markup = renderToStaticMarkup(<TraceRuler scale={scale} />);
    assert.match(markup, /data-trace-ruler="40000"/);
    const labels = [...markup.matchAll(/data-trace-tick="(\d+)"[^>]*>([^<]*)</g)].map(
        ([, tick, label]) => [Number(tick), label]
    );
    assert.deepEqual(labels, [
        [0, '0'],
        [10_000, '10s'],
        [20_000, '20s'],
        [30_000, '30s'],
        [40_000, '40s'],
    ]);
    // The first label starts on 0, the last ends on the lane's end.
    assert.match(markup, /translate-x-0[^"]*" data-trace-tick="0"/);
    assert.match(markup, /-translate-x-full[^"]*" data-trace-tick="40000"/);
    // A narrow log hides the ruler with its track column.
    assert.match(markup, /@max-2xl\/activity-log:hidden/);
});

test('log bars sit on the rounded scale, so the longest no longer touches the end', () => {
    const markup = row('log');
    // 2s + 25s on a 40s scale: from 5% for 62.5%.
    assert.match(markup, /style="height:6px;left:5%;top:calc\(50% - 3px\);width:62.5%"/);
});

test('in the log, one leader runs to the lane edge and the lane holds the gridlines', () => {
    const markup = row('log');
    const track = trackOf(markup);
    // One dotted element per row: the label's leader spans the column gap to
    // the 0 edge (a second segment there seamed), and the lane carries no dots.
    assert.equal(markup.match(/border-dotted/g)?.length, 1);
    assert.match(markup, /border-dotted -me-2 @max-2xl\/activity-log:me-0[^"]*" data-trace-leader/);
    assert.doesNotMatch(track, /border-dotted/);
    const lines = [...track.matchAll(/data-trace-gridline="(\d+)"/g)].map(([, tick]) => tick);
    assert.deepEqual(lines, ['0', '10000', '20000', '30000', '40000']);
    // The 0 line is the shared left edge, darker than the rest.
    assert.match(track, /bg-trace-axis" data-trace-gridline="0"/);
    assert.match(track, /bg-trace-grid" data-trace-gridline="20000"/);
});

test("a chat's trace keeps its full-width leader and draws no gridlines", () => {
    const markup = row('trace');
    const track = trackOf(markup);
    // The label's leader crosses the gap; the lane's picks up on its centerline.
    assert.match(markup, /border-dotted -me-2 border-border" data-trace-leader/);
    assert.match(track, /inset-x-0 top-\[calc\(50%-0\.5px\)\] border-t border-dotted/);
    assert.doesNotMatch(track, /data-trace-gridline/);
});

function row(layout: TraceLayout) {
    return renderToStaticMarkup(
        <TraceLayoutProvider layout={layout}>
            <TurnTraceScopeProvider
                scope={{ axisMs: scale?.scaleMs ?? 0, gridTicks: scale?.ticks, workspace: null }}
            >
                <TraceRow
                    bars={[
                        {
                            kind: 'tool',
                            status: 'completed',
                            timing: { durationMs: 25_000, isRunning: false, offsetMs: 2000 },
                        },
                    ]}
                    line={<span>Ran sleep 25</span>}
                    timing={{ durationMs: 25_000, isRunning: false, offsetMs: 2000 }}
                />
            </TurnTraceScopeProvider>
        </TraceLayoutProvider>
    );
}

function trackOf(markup: string): string {
    const start = markup.indexOf('data-trace-cell="track"');
    const end = markup.indexOf('data-trace-cell="duration"');
    assert.ok(start > 0 && end > start, 'row has a track before its duration');
    return markup.slice(start, end);
}
