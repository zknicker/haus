import { expect, test } from 'bun:test';
import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import {
    minMarkGap,
    readGlyphCounts,
    readMarkMeta,
    readMarkSummary,
    readOutcomeChip,
    spreadPositions,
} from './heartbeat-marks-model.ts';
import {
    formatDreamDelta,
    formatTokens,
    type LaneView,
    readDayWindow,
    readDetailFacts,
    readHourTicks,
    readLanes,
    readMarkFate,
    readNightBands,
    readPlanMeter,
    readSummaryResults,
    readTrackPosition,
    resolveSelection,
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

test('the fate line names where a report went, or why nothing ran', () => {
    const reported = mark(new Date(noon), {
        outcome: 'reported',
        report: { postedChatId: 'chat_1', text: 'Shipped' },
    });
    expect(readMarkFate(reported, '#product')).toBe('Posted in #product');
    expect(readMarkFate({ ...reported, report: { postedChatId: null, text: 'x' } }, null)).toBe(
        'Read by the Agent, nothing posted'
    );
    expect(
        readMarkFate(mark(new Date(noon), { outcome: 'paused', skipReason: 'plan-limit' }), null)
    ).toContain('80%');
});

test('dream deltas read +added minus-removed', () => {
    expect(formatDreamDelta({ added: 3, removed: 1 })).toBe('+3 −1');
});

test('summary facts pluralize and show paused only when there is some', () => {
    const base = {
        followUps: 1,
        paused: 0,
        plans: [],
        posts: 4,
        reported: 4,
        rulesLearned: 2,
        runs: 1,
        skipped: 5,
        yielded: 3,
    };
    expect(readSummaryResults(base)).toEqual([
        { count: 4, label: 'posts' },
        { count: 2, label: 'rules learned' },
        { count: 1, label: 'follow-up' },
    ]);
});

test('detail facts list memory and follow-ups for a dream, then the outcome', () => {
    const dream = mark(new Date(noon), {
        dream: { added: 1, followUps: 2, removed: 1, summaryLine: 'x' },
        kind: 'nightly',
        outcome: 'reported',
        report: { postedChatId: null, text: 'x' },
    });
    expect(readDetailFacts(dream, null)).toEqual([
        { label: 'Memory', value: '+1 −1' },
        { label: 'Follow-ups', value: '2' },
        { label: 'Outcome', value: 'Read by the Agent, nothing posted' },
    ]);
    expect(readDetailFacts(mark(new Date(noon)), null)).toEqual([
        { label: 'Outcome', value: 'Nothing to report' },
    ]);
});

test('the meta row keeps only what is known', () => {
    expect(readMarkMeta(mark(new Date(noon), { durationMs: null, tokens: 18_200 }))).toEqual([
        expect.any(String),
        '18.2k tokens',
    ]);
});

test('a plan meter splits its use into other, heartbeat, and dream, inside the bar', () => {
    const meter = readPlanMeter({
        dreamPercent: 0.8,
        heartbeatPercent: 3.2,
        label: 'Claude Max',
        runtimeId: 'claude',
        usedPercent: 62,
    });
    expect(meter.heartbeat).toBe(3.2);
    expect(meter.dream).toBe(0.8);
    expect(meter.other).toBeCloseTo(58);
    expect(meter.tooltip).toContain('~3.2% heartbeats');
    const over = readPlanMeter({
        dreamPercent: 9,
        heartbeatPercent: 9,
        label: 'Plan',
        runtimeId: 'x',
        usedPercent: 12,
    });
    expect(over.heartbeat + over.dream + over.other).toBeLessThanOrEqual(12);
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

test('the legend lists the glyph kinds on the day, dream last', () => {
    const lanes: LaneView[] = [
        {
            agentId: 'a',
            lane: lane('a', [
                mark(new Date(noon), { outcome: 'reported' }),
                mark(new Date(noon), { kind: 'nightly', outcome: 'reported' }),
                mark(new Date(noon)),
            ]),
        },
    ];
    expect(readGlyphCounts(lanes).map((entry) => entry.kind)).toEqual([
        'quiet',
        'reported',
        'dream',
    ]);
});

test('a dream chip takes the dream token unless the dream failed or paused', () => {
    expect(readOutcomeChip({ kind: 'nightly', outcome: 'reported' }).isDream).toBe(true);
    expect(readOutcomeChip({ kind: 'nightly', outcome: 'failed' })).toEqual({
        color: 'danger',
        isDream: false,
    });
    expect(readOutcomeChip({ kind: 'daytime', outcome: 'paused' }).color).toBe('warning');
    expect(readOutcomeChip({ kind: 'daytime', outcome: 'reported' }).color).toBe('accent');
});

test('selection keeps the chosen mark, else the newest reported, else the newest', () => {
    const early = mark(new Date(2026, 9, 21, 9), { outcome: 'reported' });
    const late = mark(new Date(2026, 9, 21, 15), { outcome: 'quiet' });
    const lanes: LaneView[] = [{ agentId: 'a', lane: lane('a', [early, late]) }];
    expect(resolveSelection(lanes, null)?.mark).toBe(early);
    expect(resolveSelection(lanes, `a:daytime:${late.at}`)?.mark).toBe(late);
    expect(resolveSelection(lanes, 'gone')?.mark).toBe(early);
    const quiet: LaneView[] = [
        { agentId: 'a', lane: lane('a', [late, mark(new Date(2026, 9, 21, 10))]) },
    ];
    expect(resolveSelection(quiet, null)?.mark).toBe(late);
    expect(resolveSelection([], null)).toBeNull();
});
