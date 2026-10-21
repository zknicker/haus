import { expect, test } from 'bun:test';
import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import type { ActivityLogEntry } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import { minMarkGap, readMarkSummary, spreadPositions } from './heartbeat-marks-model.ts';
import { readHeartbeatEntries } from './heartbeat-runs.ts';
import {
    formatTokens,
    type LaneView,
    readDayWindow,
    readHourTicks,
    readLanes,
    readNightBands,
    readTrackPosition,
} from './heartbeats-model.ts';

const noon = new Date(2026, 9, 21, 12, 0).getTime();
const day = readDayWindow(0, noon);

function mark(at: Date, overrides: Partial<HeartbeatMark> = {}): HeartbeatMark {
    return {
        at: at.toISOString(),
        dream: null,
        durationMs: 1000,
        kind: 'daytime',
        outcome: 'quiet',
        report: null,
        runId: 'run_1',
        skipReason: null,
        tokens: 100,
        ...overrides,
    };
}

function lane(agentId: string, marks: HeartbeatMark[]): HeartbeatLane {
    return { agentId, marks, tokens: 0 };
}

test('the day window spans the local day, and a past day sits before it', () => {
    expect(new Date(day.startMs).getHours()).toBe(0);
    expect(new Date(day.endMs).getDate()).not.toBe(new Date(day.startMs).getDate());
    expect(day.from).toBe(new Date(day.startMs).toISOString());
    expect(readDayWindow(1, noon).endMs).toBe(day.startMs);
});

test('a mark sits at its share of the day and never leaves the track', () => {
    expect(readTrackPosition(new Date(2026, 9, 21, 12).getTime(), day)).toBeCloseTo(50);
    expect(readTrackPosition(day.startMs - 1000, day)).toBe(0);
    expect(readTrackPosition(day.endMs + 1000, day)).toBe(100);
});

test('night bands cover 22:00 to 08:00 at both ends of the track', () => {
    const [morning, evening] = readNightBands(day);
    expect(morning).toEqual({ left: 0, width: expect.closeTo(100 / 3, 5) });
    expect(evening?.left).toBeCloseTo((22 / 24) * 100);
    expect((evening?.left ?? 0) + (evening?.width ?? 0)).toBeCloseTo(100);
});

test('hour ticks run the day and label every sixth hour', () => {
    const ticks = readHourTicks(day);
    expect(ticks).toHaveLength(24);
    expect(ticks.filter((tick) => tick.label).map((tick) => tick.label)).toEqual([
        '12a',
        '6a',
        '12p',
        '6p',
    ]);
});

test('tokens read short', () => {
    expect(formatTokens(null)).toBeNull();
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(18_200)).toBe('18.2k');
    expect(formatTokens(240_000)).toBe('240k');
    expect(formatTokens(1_250_000)).toBe('1.3M');
});

test('every visible Agent has a lane in the Agents order, empty when nothing ran', () => {
    const lanes = [lane('b', [mark(new Date(noon))]), lane('c', []), lane('gone', [])];
    const read = readLanes(lanes, ['a', 'b', 'c']);
    expect(read.map((entry) => entry.agentId)).toEqual(['a', 'b', 'c']);
    expect(read[0]?.lane.marks).toEqual([]);
    expect(read[1]?.lane.marks).toHaveLength(1);
});

test('marks too close on a lane are nudged apart in order and stay on the track', () => {
    const spread = spreadPositions([10, 10, 10.2, 50]);
    expect(
        spread.slice(1).every((at, index) => at - (spread[index] ?? 0) >= minMarkGap - 1e-9)
    ).toBe(true);
    expect(spread[3]).toBe(50);
    const edge = spreadPositions([99.5, 100, 100]);
    expect(Math.max(...edge)).toBeLessThanOrEqual(100);
    expect(edge[0]).toBeLessThan(edge[1] ?? 0);
});

test('a mark reads as agent, time, outcome, run time, and tokens', () => {
    const text = readMarkSummary(
        'Tiny',
        mark(new Date(2026, 9, 21, 14, 7), {
            durationMs: 41_000,
            outcome: 'reported',
            tokens: 18_200,
        })
    );
    expect(text).toMatch(/^Tiny · .*pm · Reported · 41s · 18\.2k tokens$/i);
    expect(readMarkSummary('Tiny', mark(new Date(noon), { kind: 'nightly' }))).toContain(
        'Dream quiet'
    );
});

function entry(runId: string, trigger: { kind: string } | null): ActivityLogEntry {
    return { row: { latest: { runId, trigger } } } as unknown as ActivityLogEntry;
}

test('the runs log keeps heartbeat, dream and report turns, and any run a lane marks', () => {
    const lanes: LaneView[] = [
        { agentId: 'a', lane: lane('a', [mark(new Date(noon), { runId: 'running_1' })]) },
    ];
    const kept = readHeartbeatEntries(
        [
            entry('hb', { kind: 'heartbeat' }),
            entry('dr', { kind: 'dream' }),
            entry('rp', { kind: 'heartbeat_report' }),
            entry('msg', { kind: 'message' }),
            entry('running_1', null),
            entry('other', null),
        ],
        lanes
    );
    expect(kept.map((item) => item.row.latest.runId)).toEqual(['hb', 'dr', 'rp', 'running_1']);
});
