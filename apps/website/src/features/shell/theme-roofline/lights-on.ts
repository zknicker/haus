import type { FrameMode } from './frame-loop.ts';

/**
 * Lights on: when a window first paints the roofline, snow is already falling
 * but the bulbs are dark. After a short lead-in they light left to right, each
 * with a quick flicker-up and a warm bloom that settles into the steady glow.
 * It plays once per window (a page load or an Electron window) and again only
 * after a Christmas theme is switched back on, never on a remount or a change
 * of look. Every time here is in seconds on the frame loop's clock, which holds
 * while the window is unfocused, so a sequence waits for focus.
 */
export type LightsOn =
    | { phase: 'waiting' }
    | { phase: 'playing'; start: number }
    | { phase: 'lit' };

/** One bulb's switch-on: body brightness, halo strength, and warmth. */
export interface BulbLight {
    /** Scales the halo; 1 is the steady glow, up to 1.45 at the bloom's peak. */
    glow: number;
    /** 0 dark (the glass unlit, no halo) to 1 lit. */
    lit: number;
    /** How far the halo leans toward incandescent warm white. */
    warm: number;
}

/** Dark frames before the first bulb comes on. */
export const lightsOnLeadIn = 0.2;
/** The longest the wave takes from the first bulb to the last. */
export const lightsOnSpread = 1.04;
/** One bulb's flicker-up, from dark to fully lit. */
export const flickerSeconds = 0.26;
/** When a bulb's bloom has settled back to the steady glow. */
export const bloomSeconds = 0.6;
/** The whole burst, through the last bulb's bloom. */
export const lightsOnSeconds = lightsOnLeadIn + lightsOnSpread + bloomSeconds;
/** The wave's pace along the roofline: one 40px bulb every 40ms. */
const wavePxPerSecond = 1000;

export const steadyLight: BulbLight = { glow: 1, lit: 1, warm: 0 };
const darkLight: BulbLight = { glow: 0, lit: 0, warm: 0 };
const waiting: LightsOn = { phase: 'waiting' };
const lit: LightsOn = { phase: 'lit' };

/**
 * The next state for a frame drawn at `time`. The first running frame starts
 * the burst; a held frame (unfocused) keeps the bulbs as they are; reduced
 * motion lights them at once.
 */
export function stepLightsOn(state: LightsOn, time: number, mode: FrameMode): LightsOn {
    if (state.phase === 'lit') {
        return state;
    }
    if (mode === 'still') {
        return lit;
    }
    if (state.phase === 'waiting') {
        return mode === 'running' ? { phase: 'playing', start: time } : state;
    }
    return time - state.start >= lightsOnSeconds ? lit : state;
}

/** True while the burst wants every display frame. */
export function lightsOnBurst(state: LightsOn): boolean {
    return state.phase === 'playing';
}

/**
 * When the bulb at `x` starts its flicker, after the burst starts. The wave
 * crosses the run at one bulb per 40ms, compressed to `lightsOnSpread` on a
 * long run, so a wide window is still lit by 1.5s; skipped spans (the tabs)
 * keep their time, so the wave travels under them at the same pace.
 */
export function bulbDelay(x: number, run: { first: number; last: number }): number {
    const length = run.last - run.first;
    if (length <= 0) {
        return lightsOnLeadIn;
    }
    const spread = Math.min(lightsOnSpread, length / wavePxPerSecond);
    return lightsOnLeadIn + ((x - run.first) / length) * spread;
}

/** How a bulb with `delay` is lit at `time`. */
export function bulbLight(state: LightsOn, time: number, delay: number): BulbLight {
    if (state.phase === 'lit') {
        return steadyLight;
    }
    if (state.phase === 'waiting') {
        return darkLight;
    }
    return switchOn(time - state.start - delay);
}

/**
 * One bulb `since` seconds into its switch-on: a catch to 75%, a stutter back
 * to 35%, then an ease up to full by 0.26s, with a warm bloom that peaks and
 * settles by 0.6s.
 */
export function switchOn(since: number): BulbLight {
    if (since <= 0) {
        return darkLight;
    }
    const level = flickerLevel(since);
    const bloom =
        since > 0.16 && since < bloomSeconds
            ? Math.sin((Math.PI * (since - 0.16)) / (bloomSeconds - 0.16))
            : 0;
    return { glow: 1 + 0.45 * bloom, lit: level, warm: 0.45 * (1 - level) + 0.4 * bloom };
}

// One window's sequence: armed at launch, spent by the roofline that plays it.
let armed = true;

/** The state a newly started roofline begins in. */
export function initialLightsOn(): LightsOn {
    return armed ? waiting : lit;
}

/** The sequence has started (or reduced motion lit the bulbs): no replay on remount. */
export function spendLightsOn() {
    armed = false;
}

/** A Christmas theme is off: the next roofline lights up again. */
export function armLightsOn() {
    armed = true;
}

function flickerLevel(since: number): number {
    if (since < 0.06) {
        return 0.75 * (since / 0.06);
    }
    if (since < 0.11) {
        return 0.75 - 0.4 * ((since - 0.06) / 0.05);
    }
    if (since < flickerSeconds) {
        return 0.35 + 0.65 * easeOut((since - 0.11) / (flickerSeconds - 0.11));
    }
    return 1;
}

const easeOut = (value: number) => 1 - (1 - Math.min(1, Math.max(0, value))) ** 3;
