import { expect, test } from 'bun:test';
import { buildDayTimeline, type TimelineTurnInput } from './agent-activity-log-overview-model.ts';

const minute = 60_000;
const start = Date.UTC(2026, 9, 6, 9, 0);
const measure = { blockGap: 0.5, labelGap: 8, minBlock: 2 };

test('idle longer than twelve minutes folds into one labeled break', () => {
    const timeline = buildDayTimeline(
        [turn('a', 0, 2), turn('b', 5, 6), turn('c', 180, 183)],
        start + 200 * minute,
        false,
        measure
    );
    // a and b share a stretch; three hours of idle become one break.
    expect(timeline.spans).toHaveLength(2);
    expect(timeline.breaks).toHaveLength(1);
    expect(timeline.breaks[0]?.label).toBe('3h');
    const [first, second] = timeline.spans;
    expect((first?.left ?? 0) + (first?.width ?? 0)).toBeLessThan(timeline.breaks[0]?.at ?? 0);
    expect(timeline.breaks[0]?.at).toBeLessThan(second?.left ?? 0);
    // The axis stays within the strip.
    expect((second?.left ?? 0) + (second?.width ?? 0)).toBeCloseTo(100, 5);
});

test('every turn keeps the minimum width and never overlaps its neighbour', () => {
    const timeline = buildDayTimeline(
        [turn('a', 0, 0.05), turn('b', 0.1, 0.15), turn('c', 0.2, 30)],
        start + 40 * minute,
        false,
        measure
    );
    const blocks = timeline.blocks;
    expect(blocks.map((block) => block.runId)).toEqual(['a', 'b', 'c']);
    for (const block of blocks) {
        expect(block.width).toBeGreaterThanOrEqual(measure.minBlock);
        expect(block.left + block.width).toBeLessThanOrEqual(100 + 1e-9);
    }
    for (let index = 1; index < blocks.length; index += 1) {
        const previous = blocks[index - 1];
        const next = blocks[index];
        expect(next?.left).toBeGreaterThanOrEqual(
            (previous?.left ?? 0) + (previous?.width ?? 0) + measure.blockGap - 1e-9
        );
    }
});

test("today's axis ends at now, with a break when now is far from the last turn", () => {
    const close = buildDayTimeline([turn('a', 0, 5)], start + 10 * minute, true, measure);
    expect(close.breaks).toHaveLength(0);
    expect(close.ticks.at(-1)).toMatchObject({ at: 100, rank: 'now' });

    const far = buildDayTimeline([turn('a', 0, 5)], start + 90 * minute, true, measure);
    expect(far.breaks.map((gap) => gap.label)).toEqual(['1h']);
    expect(far.ticks.at(-1)).toMatchObject({ at: 100, rank: 'now' });
});

test('each stretch names its first turn; labels never overlap', () => {
    const timeline = buildDayTimeline(
        [turn('a', 0, 20), turn('b', 120, 121), turn('c', 300, 340)],
        start + 400 * minute,
        false,
        measure
    );
    const starts = timeline.ticks.filter((tick) => tick.rank === 'start');
    expect(starts.map((tick) => tick.time)).toEqual([
        start,
        start + 120 * minute,
        start + 300 * minute,
    ]);
    const sorted = [...timeline.ticks].sort((left, right) => left.at - right.at);
    for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const next = sorted[index];
        const previousEnd =
            previous?.rank === 'start'
                ? (previous.at ?? 0) + measure.labelGap
                : (previous?.at ?? 0) + measure.labelGap / 2;
        const nextStart =
            next?.rank === 'start' ? (next.at ?? 0) : (next?.at ?? 0) - measure.labelGap / 2;
        expect(nextStart).toBeGreaterThanOrEqual(previousEnd);
    }
});

test('an empty day draws nothing', () => {
    expect(buildDayTimeline([], start, true, measure)).toEqual({
        blocks: [],
        breaks: [],
        isToday: true,
        spans: [],
        ticks: [],
    });
});

function turn(runId: string, fromMinute: number, toMinute: number): TimelineTurnInput {
    return {
        endMs: start + toMinute * minute,
        runId,
        startMs: start + fromMinute * minute,
        status: 'completed',
    };
}
