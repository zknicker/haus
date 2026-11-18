import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTraceTick, placeTick, readTraceScale } from './turn-trace-scale.ts';

const s = 1000;
const m = 60 * s;

test('a turn rounds up to a clock step it can count in four intervals', () => {
    assert.deepEqual(readTraceScale(32 * s), {
        scaleMs: 40 * s,
        ticks: [0, 10 * s, 20 * s, 30 * s, 40 * s],
    });
    assert.deepEqual(readTraceScale(4 * s)?.ticks, [0, s, 2 * s, 3 * s, 4 * s]);
    assert.deepEqual(readTraceScale(4.3 * s)?.ticks, [0, 2 * s, 4 * s, 6 * s]);
    assert.deepEqual(readTraceScale(44 * s)?.ticks, [0, 20 * s, 40 * s, m]);
    assert.equal(readTraceScale(6 * m + 10 * s)?.scaleMs, 8 * m);
    assert.deepEqual(readTraceScale(6 * m + 10 * s)?.ticks, [0, 2 * m, 4 * m, 6 * m, 8 * m]);
    assert.equal(readTraceScale(350)?.scaleMs, 400);
});

test('every scale covers its axis with three to five ticks', () => {
    for (let axis = 3; axis < 3 * 60 * m; axis = Math.ceil(axis * 1.07)) {
        const scale = readTraceScale(axis);
        assert.ok(scale, `no scale for ${axis}`);
        assert.ok(scale.scaleMs >= axis, `${axis} overflows ${scale.scaleMs}`);
        assert.ok(
            scale.ticks.length >= 3 && scale.ticks.length <= 5,
            `${axis}: ${scale.ticks.length} ticks`
        );
        assert.equal(scale.ticks.at(-1), scale.scaleMs);
    }
});

test('an empty or unknown axis has no ruler', () => {
    assert.equal(readTraceScale(0), null);
    assert.equal(readTraceScale(Number.NaN), null);
    assert.equal(readTraceScale(-5), null);
});

test('tick labels read as clock times', () => {
    assert.deepEqual(
        [0, 500, 2 * s, 30 * s, m, 90 * s, 8 * m, 60 * m, 90 * m].map(formatTraceTick),
        ['0', '500ms', '2s', '30s', '1m', '1m 30s', '8m', '1h', '1h 30m']
    );
});

test('a gridline stays inside the lane at both ends', () => {
    assert.equal(placeTick(0, 40 * s), 'calc(0% - 0px)');
    assert.equal(placeTick(20 * s, 40 * s), 'calc(50% - 0.5px)');
    assert.equal(placeTick(40 * s, 40 * s), 'calc(100% - 1px)');
});
