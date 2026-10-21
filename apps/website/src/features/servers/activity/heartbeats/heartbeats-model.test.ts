import { expect, test } from 'bun:test';
import type { HeartbeatLane, HeartbeatMark } from '@haus/api';
import {
    readDreamThoughts,
    readFeedDays,
    readFeedEntry,
    readReportThoughts,
} from './heartbeat-feed-model.ts';
import { readRoster } from './heartbeat-roster-model.ts';
import {
    mergeLanes,
    pageDays,
    readDayBounds,
    readNextPageIndex,
    readPageWindow,
    readTrackPosition,
} from './heartbeats-model.ts';

const noon = new Date(2026, 9, 21, 12, 0).getTime();
const hour = 60 * 60 * 1000;
const day = 24 * hour;

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

function reported(atMs: number, text = 'News.'): HeartbeatMark {
    return mark(atMs, { outcome: 'reported', report: { postedChatId: null, text } });
}

function dreamed(atMs: number, summary: string | null): HeartbeatMark {
    return mark(atMs, {
        dream: {
            added: 2,
            followUpTitles: [],
            followUps: 0,
            removed: 1,
            summary,
            summaryLine: null,
        },
        kind: 'nightly',
    });
}

function lane(agentId: string, marks: HeartbeatMark[]): HeartbeatLane {
    return { agentId, marks, tokens: 0 };
}

test('a page reads pageDays local days ending where the newer page began', () => {
    const first = readPageWindow(0, noon);
    const second = readPageWindow(1, noon);
    expect(Date.parse(first.to)).toBe(readDayBounds(noon).endMs);
    expect(Date.parse(first.to) - Date.parse(first.from)).toBeGreaterThanOrEqual(
        pageDays * day - hour
    );
    expect(second.to).toBe(first.from);
});

test('paging continues while a page held marks and stops at an empty one', () => {
    expect(readNextPageIndex(0, [lane('a', [mark(noon)])])).toBe(1);
    expect(readNextPageIndex(3, [lane('a', [])])).toBeNull();
    expect(readNextPageIndex(29, [lane('a', [mark(noon)])])).toBeNull();
});

test('merging pages gives one oldest-first lane per Agent and keeps each mark once', () => {
    const older = mark(noon - 4 * day);
    const newer = mark(noon);
    const merged = mergeLanes([[lane('a', [newer])], [lane('a', [older, newer]), lane('b', [])]]);
    expect(merged.map((entry) => entry.agentId)).toEqual(['a', 'b']);
    expect(merged[0]?.marks.map((entry) => entry.at)).toEqual([older.at, newer.at]);
});

test('a mark sits at its share of its day and never leaves the track', () => {
    const bounds = readDayBounds(noon);
    expect(readTrackPosition(noon, bounds)).toBeCloseTo(50);
    expect(readTrackPosition(bounds.startMs - 1000, bounds)).toBe(0);
    expect(readTrackPosition(bounds.endMs + 1000, bounds)).toBe(100);
});

test('reports and dreams are posts; failed and yielded runs are notes; quiet runs take no row', () => {
    expect(readFeedEntry('a', reported(noon))?.kind).toBe('post');
    expect(readFeedEntry('a', dreamed(noon, '- Learned.'))).toMatchObject({
        kind: 'post',
        postKind: 'dreamed',
    });
    expect(readFeedEntry('a', mark(noon, { outcome: 'failed' }))).toMatchObject({
        kind: 'note',
        reason: 'failed',
    });
    expect(readFeedEntry('a', mark(noon, { outcome: 'yielded' }))).toMatchObject({
        kind: 'note',
        reason: 'yielded',
    });
    expect(readFeedEntry('a', mark(noon))).toBeNull();
    expect(readFeedEntry('a', mark(noon, { outcome: 'running' }))).toBeNull();
    expect(readFeedEntry('a', mark(noon, { outcome: 'paused', runId: null }))).toBeNull();
});

test('a dream is a thought per learned line, bullets stripped', () => {
    expect(readDreamThoughts('\n- Lead with the answer.\n* Name files.\n\n')).toEqual([
        'Lead with the answer.',
        'Name files.',
    ]);
    expect(readDreamThoughts(null)).toEqual([]);
});

test('a report is a thought per paragraph and per bullet', () => {
    expect(
        readReportThoughts('Sales dipped\nunder pace.\n\nAds are flat.\n- Check mugs\n- Check ads')
    ).toEqual(['Sales dipped under pace.', 'Ads are flat.', 'Check mugs', 'Check ads']);
});

test('the feed groups entries by local day, newest day and entry first, and filters by Agent', () => {
    const lanes = [
        lane('a', [reported(noon - day), reported(noon), mark(noon + hour)]),
        lane('b', [mark(noon + 2 * hour, { outcome: 'failed' }), dreamed(noon - day, '- One.')]),
    ];
    const days = readFeedDays(lanes, []);
    expect(days.map((entry) => entry.startMs)).toEqual([
        readDayBounds(noon).startMs,
        readDayBounds(noon - day).startMs,
    ]);
    expect(days[0]?.entries.map((entry) => entry.kind)).toEqual(['note', 'post']);
    expect(days[1]?.entries).toHaveLength(2);
    const onlyB = readFeedDays(lanes, ['b']);
    expect(onlyB.flatMap((entry) => entry.entries.map((item) => item.agentId))).toEqual(['b', 'b']);
});

test('the roster rings and words each Agent by today, last night, and what runs now', () => {
    const lanes = [
        lane('news', [mark(noon - hour), reported(noon - 30 * 60 * 1000)]),
        lane('dream', [
            dreamed(readDayBounds(noon).startMs + 3 * hour, '- One.'),
            mark(noon - hour),
        ]),
        lane('quiet', [mark(noon - 2 * hour), mark(noon - hour)]),
        lane('live', [mark(noon - 60_000, { outcome: 'running' })]),
        lane('paused', [
            mark(noon - hour, { outcome: 'paused', runId: null, skipReason: 'plan-limit' }),
        ]),
    ];
    const roster = readRoster(['news', 'dream', 'quiet', 'live', 'paused', 'none'], lanes, noon);
    const by = (agentId: string) => roster.find((entry) => entry.agentId === agentId);
    expect(by('news')).toMatchObject({ ring: 'new', status: expect.stringMatching(/^1 new · /) });
    expect(by('dream')).toMatchObject({ ring: 'dream', status: 'Dreamed · quiet today' });
    expect(by('quiet')).toMatchObject({ ring: 'quiet', status: 'Quiet · 2 check-ins' });
    expect(by('live')).toMatchObject({ isLive: true, status: 'Checking in…' });
    expect(by('paused')?.status).toBe('Paused · plan limit');
    expect(by('none')?.status).toBe('No check-ins yet');
});

test('a dream with nothing learned is a system note, not an empty bubble', () => {
    expect(readFeedEntry('a', dreamed(noon, null))).toMatchObject({
        kind: 'note',
        reason: 'dreamed',
    });
});
