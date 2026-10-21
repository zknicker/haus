import { expect, test } from 'bun:test';
import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import {
    isPost,
    readFeed,
    readQuietFoldText,
    readRunCost,
    readSummaryLines,
} from './heartbeat-feed-model.ts';
import {
    formatTokens,
    readDayWindow,
    readNightBands,
    readTrackPosition,
} from './heartbeats-model.ts';

const noon = new Date(2026, 9, 21, 12, 0).getTime();
const day = readDayWindow(0, noon);
const hour = 60 * 60 * 1000;

function mark(atMs: number, overrides: Partial<HeartbeatMark> = {}): HeartbeatMark {
    return {
        at: new Date(atMs).toISOString(),
        dream: null,
        durationMs: 1000,
        kind: 'daytime',
        outcome: 'quiet',
        report: null,
        runId: `run_${atMs}`,
        skipReason: null,
        tokens: 100,
        ...overrides,
    };
}

function reported(atMs: number): HeartbeatMark {
    return mark(atMs, { outcome: 'reported', report: { postedChatId: null, text: 'News.' } });
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
    expect(readTrackPosition(noon, day)).toBeCloseTo(50);
    expect(readTrackPosition(day.startMs - 1000, day)).toBe(0);
    expect(readTrackPosition(day.endMs + 1000, day)).toBe(100);
});

test('night bands cover 22:00 to 08:00 at both ends of the track', () => {
    const [morning, evening] = readNightBands(day);
    expect(morning).toEqual({ left: 0, width: expect.closeTo(100 / 3, 5) });
    expect(evening?.left).toBeCloseTo((22 / 24) * 100);
    expect((evening?.left ?? 0) + (evening?.width ?? 0)).toBeCloseTo(100);
});

test('tokens read short', () => {
    expect(formatTokens(null)).toBeNull();
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(18_200)).toBe('18.2k');
    expect(formatTokens(240_000)).toBe('240k');
    expect(formatTokens(1_250_000)).toBe('1.3M');
});

test('reported, failed, yielded runs and settled dreams are posts; quiet and unstarted are not', () => {
    expect(isPost(reported(noon))).toBe(true);
    expect(isPost(mark(noon, { outcome: 'failed' }))).toBe(true);
    expect(isPost(mark(noon, { outcome: 'yielded' }))).toBe(true);
    expect(isPost(mark(noon, { kind: 'nightly' }))).toBe(true);
    expect(isPost(mark(noon))).toBe(false);
    expect(isPost(mark(noon, { outcome: 'running' }))).toBe(false);
    expect(isPost(mark(noon, { outcome: 'skipped', runId: null }))).toBe(false);
});

test('the feed runs newest first and folds consecutive quiet runs per Agent', () => {
    const items = readFeed([
        lane('a', [
            mark(noon),
            mark(noon + hour),
            mark(noon + 2 * hour, { outcome: 'skipped', runId: null }),
            mark(noon + 3 * hour),
            reported(noon + 4 * hour),
            mark(noon + 5 * hour),
        ]),
        lane('b', [reported(noon + 2.5 * hour)]),
    ]);
    expect(items.map((item) => item.kind)).toEqual(['quiet', 'post', 'quiet', 'post']);
    const [last, , folded] = items;
    expect(last?.kind === 'quiet' ? last.marks : []).toHaveLength(1);
    // The skipped slot between quiet runs does not break the fold.
    expect(folded?.kind === 'quiet' ? folded.marks : []).toHaveLength(3);
});

test('a post between quiet runs splits the fold', () => {
    const items = readFeed([lane('a', [mark(noon), reported(noon + hour), mark(noon + 2 * hour)])]);
    expect(items.map((item) => item.kind)).toEqual(['quiet', 'post', 'quiet']);
});

test('a quiet fold reads as who, how many times, and nothing to report', () => {
    expect(readQuietFoldText('Blippy', 4)).toBe('Blippy checked in 4× · nothing to report');
    expect(readQuietFoldText('Blippy', 1)).toBe('Blippy checked in once · nothing to report');
});

test('a dream summary reads as its lines with bullets stripped', () => {
    expect(readSummaryLines('\n- Lead with the answer.\n* Name files.\n\n')).toEqual([
        'Lead with the answer.',
        'Name files.',
    ]);
    expect(readSummaryLines(null)).toEqual([]);
});

test('a run costs its duration and tokens', () => {
    expect(readRunCost(mark(noon, { durationMs: 41_000, tokens: 18_200 }))).toBe(
        '41s · 18.2k tokens'
    );
    expect(readRunCost(mark(noon, { durationMs: null, tokens: null }))).toBe('');
});
