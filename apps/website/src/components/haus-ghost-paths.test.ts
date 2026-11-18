import { describe, expect, test } from 'bun:test';
import { EYES_PATH } from './haus-ghost-paths.ts';

describe('Haus ghost eyes', () => {
    test('are stadiums, with no corner anywhere on them', () => {
        const eyes = readSubpaths(EYES_PATH);

        expect(eyes).toHaveLength(2);
        for (const eye of eyes) {
            // Two flanks and four quarter-circle cubics. The body was
            // auto-traced, and a re-trace of the eyes would land a dozen-plus
            // knots here — the ones that read as flat corners at large sizes.
            expect(eye.map((segment) => segment.letter).join('')).toBe('MLCCLCC');
            for (const turn of turnsDegrees(eye)) {
                expect(turn).toBeLessThan(0.05);
            }
        }
    });

    test('sit where the app-icon eye layer puts them', () => {
        const [left, right] = readSubpaths(EYES_PATH).map(box);

        // Centers, size, and tilt come from the icon's own eye raster, so the
        // mark stays the app icon's face rather than drifting toward a
        // tidier one. Compared against the trace these replace, to a tenth of
        // a viewBox unit — a tenth of a pixel on a 256px mark.
        expect(left).toEqual({ x: 87.25, y: 50.21, width: 29.18, height: 51.87 });
        expect(right).toEqual({ x: 129.31, y: 51.38, width: 26.99, height: 48.99 });
    });
});

type Point = readonly [number, number];

interface Segment {
    letter: string;
    points: Point[];
}

/**
 * The eyes are hand-written in absolute `M`/`L`/`C`/`z`, so a small reader is
 * enough — and it keeps the corner check honest about the real command run
 * rather than about a string we could have matched loosely.
 */
function readSubpaths(d: string): Segment[][] {
    return d
        .split('z')
        .filter((subpath) => subpath.trim().length > 0)
        .map((subpath) =>
            [...subpath.matchAll(/([MLC])([^MLCz]*)/g)].map(([, letter, args]) => ({
                letter: letter as string,
                points: pairUp((args?.match(/-?[\d.]+/g) ?? []).map(Number)),
            }))
        );
}

function pairUp(numbers: number[]): Point[] {
    return numbers.flatMap((value, index) =>
        index % 2 === 1 ? [[numbers[index - 1] as number, value] as Point] : []
    );
}

/**
 * How far the outline turns at each knot of a closed subpath. A stadium turns
 * nowhere: every flank leaves along its cap's own tangent, and a cap's two
 * quarter-circles meet running the same way.
 */
function turnsDegrees(segments: Segment[]) {
    let at = segments[0]?.points[0] as Point;
    const sides = segments.slice(1).map((segment) => {
        const from = at;
        at = segment.points.at(-1) as Point;
        const straight = segment.letter === 'L';
        return {
            arriving: straight ? from : (segment.points[1] as Point),
            end: at,
            leaving: straight ? at : (segment.points[0] as Point),
        };
    });
    return sides.map(({ arriving, end }, index) => {
        const next = sides[(index + 1) % sides.length]?.leaving as Point;
        const [ix, iy] = [end[0] - arriving[0], end[1] - arriving[1]];
        const [ox, oy] = [next[0] - end[0], next[1] - end[1]];
        return Math.abs((Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy) * 180) / Math.PI);
    });
}

/** The outline's own box, to a hundredth of a viewBox unit. */
function box(segments: Segment[]) {
    let at = segments[0]?.points[0] as Point;
    const outline: Point[] = [at];
    for (const segment of segments.slice(1)) {
        const end = segment.points.at(-1) as Point;
        if (segment.letter === 'C') {
            // A cap's extremes lie on the arc, not on the kappa handles that
            // reach past it, so walk the curve rather than its control hull.
            for (let step = 1; step < 512; step++) {
                outline.push(onCubic(at, segment.points, end, step / 512));
            }
        }
        outline.push(end);
        at = end;
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    const spread = (index: 0 | 1) => outline.map((point) => point[index] as number);
    const x = spread(0);
    const y = spread(1);
    return {
        height: round(Math.max(...y) - Math.min(...y)),
        width: round(Math.max(...x) - Math.min(...x)),
        x: round(Math.min(...x)),
        y: round(Math.min(...y)),
    };
}

function onCubic(from: Point, handles: Point[], to: Point, t: number): Point {
    const [first, second] = handles as [Point, Point, Point];
    const u = 1 - t;
    const at = (index: 0 | 1) =>
        u ** 3 * (from[index] as number) +
        3 * u * u * t * (first[index] as number) +
        3 * u * t * t * (second[index] as number) +
        t ** 3 * (to[index] as number);
    return [at(0), at(1)];
}
