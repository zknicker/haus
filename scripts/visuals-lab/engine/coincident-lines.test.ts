import { expect, test } from 'bun:test';
import {
    coincidentLines,
    columnsOf,
    describeCoincidence,
    type SeriesLine,
} from './coincident-lines.ts';
import { analyzeLayout, type LayoutFacts } from './layout-probe.ts';

type Point = [number, number];

const line = (overrides: Partial<SeriesLine> & { points: Point[] }): SeriesLine => ({
    dashed: false,
    label: '',
    plotWidth: 700,
    stroke: 'rgb(57, 135, 229)',
    svg: 0,
    ...overrides,
});

// The ui-mockup cell: actual runs half the month, a hair above a straight pace line.
const pace = line({
    dashed: true,
    label: 'Goal pace',
    points: [
        [0, 64],
        [700, 4],
    ],
    stroke: 'rgb(136, 136, 136)',
});
const actual = line({
    label: 'Actual',
    points: Array.from({ length: 15 }, (_, day): Point => {
        const x = (day / 30) * 700;
        return [x, 64 - (60 * x) / 700 - (day % 3) * 0.4];
    }),
});

test('an actual line riding its pace line is flagged with names, gap and share', () => {
    const [pair, ...rest] = coincidentLines([pace, actual]);
    expect(rest).toEqual([]);
    expect(pair && describeCoincidence(pair)).toBe(
        'lines "Goal pace" (dashed) and "Actual" nearly coincide (mean gap 0.4px over 47% of the plot)'
    );
});

test('a series oscillating around its flat dashed average is not flagged', () => {
    const daily = line({
        label: 'Daily',
        points: Array.from(
            { length: 30 },
            (_, day): Point => [day * 24, 100 + (day % 2 ? 24 : -24)]
        ),
    });
    const average = line({
        dashed: true,
        label: 'Average',
        points: [
            [0, 100],
            [700, 100],
        ],
        stroke: 'rgb(136, 136, 136)',
    });
    expect(coincidentLines([daily, average])).toEqual([]);
});

test('two series that track a few px apart are not flagged', () => {
    const shifted = line({
        label: 'Ahead',
        points: actual.points.map(([x, y]): Point => [x, y - 4]),
        stroke: 'rgb(0, 160, 120)',
    });
    expect(coincidentLines([actual, shifted])).toEqual([]);
});

test('lines in different svgs, or one color drawn twice, are never a pair', () => {
    expect(coincidentLines([pace, { ...actual, svg: 1 }])).toEqual([]);
    expect(coincidentLines([actual, { ...actual, dashed: true }])).toEqual([]);
});

test('a short overlap is not enough: it must cover half the shorter line', () => {
    const late = line({
        label: 'Late',
        points: [
            [300, 38.3],
            [700, 4],
        ],
        stroke: 'rgb(0, 160, 120)',
    });
    const early = line({
        label: 'Early',
        points: [
            [0, 64],
            [330, 35.7],
        ],
    });
    expect(coincidentLines([late, early])).toEqual([]);
});

test('gridlines, ticks and closed shapes are not plausible series', () => {
    expect(
        columnsOf([
            [0, 60],
            [700, 60],
        ])
    ).toBeNull();
    expect(
        columnsOf([
            [40, 0],
            [40, 64],
        ])
    ).toBeNull();
    // An area outline: along the top, then back along the baseline.
    expect(
        columnsOf([
            [0, 40],
            [700, 10],
            [700, 64],
            [0, 64],
            [0, 40],
        ])
    ).toBeNull();
});

test('analyzeLayout reports coincident lines as their own finding kind', () => {
    const facts: LayoutFacts = {
        clipCandidates: [],
        overflowRoots: [],
        scrollWidth: 736,
        seriesLines: [pace, actual],
        svgTexts: [],
        textBoxes: [],
        viewportWidth: 736,
    };
    expect(analyzeLayout(facts).map((finding) => finding.kind)).toEqual(['coincident-lines']);
});
