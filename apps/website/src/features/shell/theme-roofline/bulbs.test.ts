import { expect, test } from 'bun:test';
import { bulbColor, bulbSwell } from './bulbs.ts';

const step = 0.05;

/** Every swell a slot makes over `seconds`: when it starts and how long it lasts. */
function swells(slot: number, seconds: number) {
    const found: { length: number; start: number }[] = [];
    let current: { length: number; start: number } | null = null;
    for (let time = 600; time < 600 + seconds; time += step) {
        if (bulbSwell(slot, time) > 0) {
            current ??= { length: 0, start: time };
            current.length += step;
        } else if (current) {
            found.push(current);
            current = null;
        }
    }
    return found;
}

test('each bulb glows steadily and swells for about 3.4s every 9 to 23 seconds', () => {
    for (const slot of [0, 1, 2, 7, 23]) {
        const found = swells(slot, 120);
        expect(found.length).toBeGreaterThanOrEqual(4);
        for (const [index, swell] of found.entries()) {
            expect(swell.length).toBeLessThanOrEqual(3.4 + step);
            const next = found[index + 1];
            if (next) {
                const period = next.start - swell.start;
                expect(period).toBeGreaterThanOrEqual(9 - step);
                expect(period).toBeLessThanOrEqual(23 + step);
            }
        }
    }
});

test('a swell rises to full and settles back, never past it', () => {
    let peak = 0;
    for (let time = 600; time < 660; time += step) {
        const swell = bulbSwell(3, time);
        expect(swell).toBeGreaterThanOrEqual(0);
        expect(swell).toBeLessThanOrEqual(1);
        peak = Math.max(peak, swell);
    }
    expect(peak).toBeGreaterThan(0.99);
});

test('bulbs keep their own clocks, so the strand never pulses together', () => {
    const starts = [0, 1, 2, 3, 4].map((slot) => swells(slot, 60)[0]?.start.toFixed(1));

    expect(new Set(starts).size).toBe(starts.length);
});

test('colors run red, gold, green, blue, pink along the grid', () => {
    expect([0, 1, 2, 3, 4, 5].map((slot) => bulbColor(slot))).toEqual([
        [255, 64, 64],
        [255, 196, 46],
        [44, 200, 106],
        [58, 140, 255],
        [255, 104, 184],
        [255, 64, 64],
    ]);
});
