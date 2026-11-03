import { afterEach, expect, test } from 'bun:test';
import {
    armLightsOn,
    bulbDelay,
    bulbLight,
    flickerSeconds,
    initialLightsOn,
    type LightsOn,
    lightsOnBurst,
    lightsOnLeadIn,
    lightsOnSeconds,
    lightsOnSpread,
    spendLightsOn,
    steadyLight,
    stepLightsOn,
    switchOn,
} from './lights-on.ts';

afterEach(() => {
    armLightsOn();
});

const start = 600;
const playing: LightsOn = { phase: 'playing', start };
/** Bulbs every 40px, as geometry.ts hangs them. */
const strand = (count: number) => Array.from({ length: count }, (_, index) => 120 + index * 40);
const runOf = (xs: number[]) => ({ first: xs[0] ?? 0, last: xs.at(-1) ?? 0 });

test('the wave lights left to right about 40ms a bulb', () => {
    const xs = strand(20);
    const delays = xs.map((x) => bulbDelay(x, runOf(xs)));

    expect(delays[0]).toBe(lightsOnLeadIn);
    for (let index = 1; index < delays.length; index++) {
        expect((delays[index] ?? 0) - (delays[index - 1] ?? 0)).toBeCloseTo(0.04, 6);
    }
});

test('a long strand compresses its wave, so it is lit by 1.5s', () => {
    const xs = strand(60);
    const last = bulbDelay(xs.at(-1) ?? 0, runOf(xs));

    expect(last).toBeCloseTo(lightsOnLeadIn + lightsOnSpread, 6);
    expect(last + flickerSeconds).toBeCloseTo(1.5, 6);
});

test('the wave keeps its pace under the tabs it skips', () => {
    // A gap where tabs sit: the bulb after it waits for the wave to cross.
    const xs = [120, 160, 200, 480, 520];
    const delays = xs.map((x) => bulbDelay(x, runOf(xs)));

    expect((delays[3] ?? 0) - (delays[2] ?? 0)).toBeCloseTo(0.28, 6);
});

test('the flicker starts dark, stutters, and ends fully lit', () => {
    expect(switchOn(0)).toEqual({ glow: 0, lit: 0, warm: 0 });
    expect(switchOn(-1).lit).toBe(0);
    expect(switchOn(0.06).lit).toBeCloseTo(0.75, 6);
    expect(switchOn(0.11).lit).toBeCloseTo(0.35, 6);
    expect(switchOn(flickerSeconds).lit).toBe(1);
    for (let since = 0; since <= 1; since += 0.01) {
        const light = switchOn(since);
        expect(light.lit).toBeGreaterThanOrEqual(0);
        expect(light.lit).toBeLessThanOrEqual(1);
        expect(light.glow).toBeLessThanOrEqual(1.45 + 1e-9);
    }
});

test('the warm bloom settles back to the steady glow by 0.6s', () => {
    expect(switchOn(0.38).glow).toBeGreaterThan(1.4);
    expect(switchOn(0.38).warm).toBeGreaterThan(0.35);
    expect(switchOn(0.6)).toEqual(steadyLight);
    expect(switchOn(5)).toEqual(steadyLight);
});

test('every bulb is lit by the end of the burst', () => {
    const xs = strand(40);
    const end = start + lightsOnSeconds;
    for (const x of xs) {
        expect(bulbLight(playing, end, bulbDelay(x, runOf(xs)))).toEqual(steadyLight);
    }
    expect(stepLightsOn(playing, end, 'running')).toEqual({ phase: 'lit' });
    expect(stepLightsOn(playing, end - 0.01, 'running')).toBe(playing);
});

test('bulbs wait dark until the first running frame, then play at display rate', () => {
    const waiting = initialLightsOn();
    expect(waiting).toEqual({ phase: 'waiting' });
    expect(bulbLight(waiting, start, 0).lit).toBe(0);
    expect(lightsOnBurst(waiting)).toBe(false);

    // Unfocused at first paint: held frames keep them dark.
    expect(stepLightsOn(waiting, start, 'held')).toBe(waiting);

    const started = stepLightsOn(waiting, start + 3, 'running');
    expect(started).toEqual({ phase: 'playing', start: start + 3 });
    expect(lightsOnBurst(started)).toBe(true);
    expect(bulbLight(started, start + 3, lightsOnLeadIn).lit).toBe(0);
});

test('a burst held by a blur resumes where it was', () => {
    expect(stepLightsOn(playing, start + 0.5, 'held')).toBe(playing);
});

test('reduced motion paints the bulbs already lit', () => {
    const lit = stepLightsOn(initialLightsOn(), start, 'still');
    expect(lit).toEqual({ phase: 'lit' });
    expect(stepLightsOn(playing, start + 0.1, 'still')).toEqual({ phase: 'lit' });
    expect(bulbLight(lit, start, 0)).toEqual(steadyLight);
    expect(lightsOnBurst(lit)).toBe(false);
});

test('plays once per window until a Christmas theme is switched on again', () => {
    expect(initialLightsOn().phase).toBe('waiting');
    spendLightsOn();
    // A remount (placement, look) starts lit.
    expect(initialLightsOn().phase).toBe('lit');
    armLightsOn();
    expect(initialLightsOn().phase).toBe('waiting');
});
