import * as z from 'zod';

export const seriesLineSchema = z.object({
    dashed: z.boolean(),
    label: z.string(),
    plotWidth: z.number(),
    points: z.array(z.tuple([z.number(), z.number()])),
    stroke: z.string(),
    svg: z.number(),
});
export type SeriesLine = z.output<typeof seriesLineSchema>;

export interface CoincidentPair {
    a: SeriesLine;
    b: SeriesLine;
    /** Mean vertical gap in px over the columns both lines cover. */
    meanGap: number;
    /** Shared x-range as a share of the svg's width. */
    plotShare: number;
}

// Conservative on purpose: only lines a reader cannot tell apart. Gridlines,
// axes and ticks are out (solid and flat, or too short), and
// so is anything that doubles back on itself (an area outline, a closed
// shape), since it is not a function of x.
const columnPx = 2;
const minSpanPx = 40;
const minRisePx = 1;
const maxTravel = 1.25;
const minSharedShare = 0.5;
// Two real series that track closely but cross (GB vs DE weekly revenue) sit
// around 3.1-3.3px; a pace line under its actual sits under 2.5px.
const maxMeanGapPx = 3;

/** Pairs of series strokes in one svg that sit on top of each other. */
export function coincidentLines(lines: SeriesLine[]): CoincidentPair[] {
    const shaped = lines.flatMap((line) => {
        const columns = columnsOf(line.points, line.dashed);
        return columns ? [{ columns, line }] : [];
    });
    const pairs: CoincidentPair[] = [];
    for (let i = 0; i < shaped.length; i += 1) {
        for (let j = i + 1; j < shaped.length; j += 1) {
            const a = shaped[i];
            const b = shaped[j];
            // One color drawn twice (a halo, a hit area, a projection) is one series.
            if (!(a && b) || a.line.svg !== b.line.svg || a.line.stroke === b.line.stroke) {
                continue;
            }
            const pair = comparePair(a, b);
            if (pair) {
                pairs.push(pair);
            }
        }
    }
    return pairs;
}

/** `lines "Actual" and "Goal pace" nearly coincide (mean gap 0.7px over 47% of the plot)` */
export function describeCoincidence(pair: CoincidentPair): string {
    return `lines ${nameOf(pair.a)} and ${nameOf(pair.b)} nearly coincide (mean gap ${pair.meanGap.toFixed(1)}px over ${Math.round(pair.plotShare * 100)}% of the plot)`;
}

type Columns = Map<number, { max: number; min: number }>;

function comparePair(
    a: { columns: Columns; line: SeriesLine },
    b: { columns: Columns; line: SeriesLine }
): CoincidentPair | null {
    let shared = 0;
    let gapSum = 0;
    for (const [column, rangeA] of a.columns) {
        const rangeB = b.columns.get(column);
        if (rangeB) {
            shared += 1;
            gapSum += Math.max(
                0,
                Math.max(rangeA.min, rangeB.min) - Math.min(rangeA.max, rangeB.max)
            );
        }
    }
    const shorter = Math.min(a.columns.size, b.columns.size);
    if (shared * columnPx < minSpanPx || shared / shorter < minSharedShare) {
        return null;
    }
    const meanGap = gapSum / shared;
    if (meanGap >= maxMeanGapPx) {
        return null;
    }
    const plotWidth = Math.max(a.line.plotWidth, b.line.plotWidth);
    const plotShare = plotWidth > 0 ? Math.min(1, (shared * columnPx) / plotWidth) : 1;
    return { a: a.line, b: b.line, meanGap, plotShare };
}

/**
 * The y-range a line covers in each 2px column, interpolated between samples
 * so a sparse or steep stretch leaves no hole. Null when the line is not a
 * plausible series: too short, doubling back, or flat and solid (a gridline
 * or axis; a flat dashed line is a reference such as an average or target).
 */
export function columnsOf(points: SeriesLine['points'], dashed = false): Columns | null {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const span = Math.max(...xs) - Math.min(...xs);
    const rise = Math.max(...ys) - Math.min(...ys);
    let travel = 0;
    for (let k = 1; k < points.length; k += 1) {
        travel += Math.abs((points[k]?.[0] ?? 0) - (points[k - 1]?.[0] ?? 0));
    }
    if (
        points.length < 2 ||
        span < minSpanPx ||
        (rise < minRisePx && !dashed) ||
        travel > span * maxTravel
    ) {
        return null;
    }
    const columns: Columns = new Map();
    const mark = (column: number, y: number) => {
        const range = columns.get(column);
        columns.set(
            column,
            range
                ? { max: Math.max(range.max, y), min: Math.min(range.min, y) }
                : { max: y, min: y }
        );
    };
    for (let k = 1; k < points.length; k += 1) {
        const [x0, y0] = points[k - 1] ?? [0, 0];
        const [x1, y1] = points[k] ?? [0, 0];
        const first = Math.floor(Math.min(x0, x1) / columnPx);
        const last = Math.floor(Math.max(x0, x1) / columnPx);
        for (let column = first; column <= last; column += 1) {
            const center = Math.min(
                Math.max((column + 0.5) * columnPx, Math.min(x0, x1)),
                Math.max(x0, x1)
            );
            const t = x1 === x0 ? 0 : (center - x0) / (x1 - x0);
            mark(column, y0 + t * (y1 - y0));
        }
        mark(Math.floor(x1 / columnPx), y1);
    }
    return columns;
}

function nameOf(line: SeriesLine): string {
    const dash = line.dashed ? ' (dashed)' : '';
    return line.label ? `"${line.label}"${dash}` : `${line.stroke}${dash}`;
}
