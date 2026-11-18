import assert from 'node:assert/strict';
import test from 'node:test';
import { assignLanes, readTiming, spanTimings, type TurnTraceTiming } from './turn-trace-timing.ts';

const origin = Date.parse('2026-10-06T17:44:00.000Z');
const at = (seconds: number) => new Date(origin + seconds * 1000).toISOString();
const clock = { now: origin + 60_000, origin };
const span = (offsetMs: number, durationMs: number | null): TurnTraceTiming => ({
    durationMs,
    isRunning: false,
    offsetMs,
});

test('timing is relative to the turn and a same-instant step has no duration', () => {
    assert.deepEqual(readTiming(at(2), at(5), false, clock), span(2000, 3000));
    assert.deepEqual(readTiming(at(2), at(2), false, clock), span(2000, null));
    assert.deepEqual(readTiming(at(2), undefined, false, clock), span(2000, null));
});

test('a running step measures elapsed time from the caller clock', () => {
    assert.deepEqual(readTiming(at(10), undefined, true, clock), {
        durationMs: 50_000,
        isRunning: true,
        offsetMs: 10_000,
    });
    assert.equal(
        readTiming(at(10), undefined, true, { ...clock, now: clock.now + 1000 }).durationMs,
        51_000
    );
});

test('overlapping siblings share a group and take the first free lane', () => {
    // Three sub-agents (19s, 16s, 7s) that ran together, then a later read.
    const lanes = assignLanes([
        span(4000, 19_000),
        span(5300, 15_800),
        span(6900, 6900),
        span(26_000, 10),
    ]);
    assert.deepEqual(lanes, [
        { group: 0, lane: 0, lanes: 3 },
        { group: 0, lane: 1, lanes: 3 },
        { group: 0, lane: 2, lanes: 3 },
        null,
    ]);
});

test('a lane frees once its step ends, and instants never join a group', () => {
    const lanes = assignLanes([
        span(0, 10_000),
        span(1000, 2000),
        null,
        span(4000, null),
        span(5000, 1000),
    ]);
    assert.deepEqual(lanes, [
        { group: 0, lane: 0, lanes: 2 },
        { group: 0, lane: 1, lanes: 2 },
        null,
        null,
        { group: 0, lane: 1, lanes: 2 },
    ]);
    assert.deepEqual(assignLanes([span(0, 1000), span(1000, 1000)]), [null, null]);
});

test('a span is the envelope of its members', () => {
    assert.deepEqual(spanTimings([span(1000, 500), span(3000, 2000)]), span(1000, 4000));
});
