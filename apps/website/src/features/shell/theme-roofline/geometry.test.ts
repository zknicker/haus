import { expect, test } from 'bun:test';
import {
    bulbSlots,
    bulbSpacing,
    hollySprigs,
    snowTiles,
    sprigWidth,
    tileOverlap,
} from './geometry.ts';

// The mock's window: 1600px wide, the traffic lights' 80px room, and Back and
// Forward at the end of a 236px lead.
const trafficLights = { end: 80, start: 0 };
const backForward = { end: 230, start: 176 };

test('bulbs hang every 40px past the traffic lights, skipping Back and Forward', () => {
    const bulbs = bulbSlots({ skip: [trafficLights, backForward], start: 80, width: 1600 });
    const xs = bulbs.map((bulb) => bulb.x);

    expect(xs.slice(0, 4)).toEqual([94, 134, 254, 294]);
    for (const [index, x] of xs.entries()) {
        expect((x - 94) % bulbSpacing).toBe(0);
        // No bulb body within 3px of a control or past the trailing edge.
        expect(x - 10 >= backForward.end || x + 10 <= backForward.start).toBe(true);
        expect(x + 7).toBeLessThanOrEqual(1600);
        if (index > 0) {
            expect(x).toBeGreaterThan(xs[index - 1] ?? 0);
        }
    }
    expect(xs.at(-1)).toBe(1574);
});

test('a bulb keeps its slot, so its color and clock, while controls move past it', () => {
    const open = bulbSlots({ skip: [trafficLights, backForward], start: 80, width: 800 });
    // Sidebar hidden: Back and Forward move up beside the traffic lights.
    const hidden = bulbSlots({
        skip: [trafficLights, { end: 136, start: 80 }],
        start: 80,
        width: 800,
    });

    expect(hidden.map((bulb) => bulb.x).slice(0, 3)).toEqual([174, 214, 254]);
    const slotAt = (bulbs: typeof open, x: number) => bulbs.find((bulb) => bulb.x === x)?.slot;
    expect(slotAt(hidden, 254)).toBe(slotAt(open, 254));
    expect(slotAt(hidden, 174)).toBe(2);
});

test('the web strip hangs bulbs only between the Haus mark and the gear', () => {
    const mark = { end: 39, start: 17 };
    const gear = { end: 236, start: 208 };
    const bulbs = bulbSlots({ skip: [mark, gear], start: 0, width: 248 });

    expect(bulbs.map((bulb) => bulb.x)).toEqual([54, 94, 134, 174]);
});

test('the snow tile alternates mirrored copies and overlaps every join', () => {
    const tiles = snowTiles(400, 130);

    expect(tiles.map((tile) => tile.mirrored)).toEqual([false, true, false, true]);
    expect(tiles[0]?.left).toBeCloseTo(-tileOverlap);
    for (const [index, tile] of tiles.entries()) {
        expect(tile.width).toBeCloseTo(130 + tileOverlap * 2);
        const next = tiles[index + 1];
        if (next) {
            // Each copy runs 0.7px into the next.
            expect(tile.left + tile.width - next.left).toBeCloseTo(tileOverlap * 2);
        }
    }
    const last = tiles.at(-1);
    expect((last?.left ?? 0) + (last?.width ?? 0)).toBeGreaterThanOrEqual(400);
    expect(snowTiles(400, 0)).toEqual([]);
});

test('holly tucks in at the lead’s end and, mirrored, at the trailing edge', () => {
    const [lead, end] = hollySprigs({ aspect: 160 / 150, leadEnd: 236, width: 1600 });

    expect(lead).toMatchObject({ left: 229, mirrored: false, top: -5, width: sprigWidth });
    expect(end).toMatchObject({ left: 1581, mirrored: true, top: -5, width: sprigWidth });
    expect(lead?.height).toBeCloseTo((sprigWidth * 160) / 150);
    // The web strip has no lead: only the trailing sprig.
    expect(hollySprigs({ aspect: 1, leadEnd: null, width: 248 })).toEqual([
        { height: sprigWidth, left: 229, mirrored: true, top: -5, width: sprigWidth },
    ]);
});
