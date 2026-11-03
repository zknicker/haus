import type { ColorThemeDefinition } from '../../lib/color-themes.ts';
import type { LocalDay } from '../advent/local-today.ts';

/**
 * When Santa's team flies over the Inbox greeting: once a day, the first time
 * the Inbox is shown after its theme's hour, and only once it can be watched.
 * Pure decisions, so every rule is testable without a clock or a window.
 */

/** Never in a window's first second: the ride is not part of a cold start. */
export const departureDelayMs = 1000;

/**
 * Christmas Eve's night ride leaves after 5pm; Christmas Morning, the light
 * theme, after noon. Read from the definition, never the theme's name.
 */
export function departureHour({ forcedMode }: Pick<ColorThemeDefinition, 'forcedMode'>): number {
    return forcedMode === 'light' ? 12 : 17;
}

/** A local day as `YYYY-MM-DD`, the form the flown-today record keeps. */
export function dayKey({ day, month, year }: LocalDay): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface ArmInput {
    /** The theme's departure hour (`departureHour`). */
    readonly departureHour: number;
    /** The day the team last flew in this browser profile, as `dayKey`. */
    readonly flownOn: string | null;
    /** The dev-only `haus.debug-sleigh` flag: fly on this show whatever the hour or record. */
    readonly forced: boolean;
    /** The local hour, 0-23. */
    readonly hour: number;
    readonly reducedMotion: boolean;
    readonly today: string;
}

/** Whether showing the Inbox now arms today's ride. Reduce Motion never flies. */
export function shouldArm(input: ArmInput): boolean {
    if (input.reducedMotion) {
        return false;
    }
    if (input.forced) {
        return true;
    }
    return input.flownOn !== input.today && input.hour >= input.departureHour;
}

export interface WatchSignals {
    /** The window has focus (desktop: no `window-blurred` on the root). */
    readonly focused: boolean;
    /** The strip intersects the viewport. */
    readonly onScreen: boolean;
    readonly reducedMotion: boolean;
    /** The document is not hidden. */
    readonly visible: boolean;
}

export interface DepartureSignals extends WatchSignals {
    /** The Inbox is at its top, so the strip is the air under the trail. */
    readonly atTop: boolean;
    /** The art is decoded and the strip measured tall enough to fly through. */
    readonly ready: boolean;
    /** Milliseconds since the window loaded. */
    readonly sinceLoadMs: number;
}

/**
 * An armed ride leaves only once it can be watched: focused, visible, on
 * screen, at the top of the Inbox, and past the window's first second. Reduce
 * Motion grounds it for good.
 */
export function departureGate(signals: DepartureSignals): 'abort' | 'depart' | 'wait' {
    if (signals.reducedMotion) {
        return 'abort';
    }
    const watchable =
        isWatched(signals) &&
        signals.ready &&
        signals.atTop &&
        signals.sinceLoadMs >= departureDelayMs;
    return watchable ? 'depart' : 'wait';
}

export interface FlightClock {
    /** Seconds flown. */
    readonly elapsed: number;
    /** The last running frame's timestamp, or null after a hold. */
    readonly lastTick: number | null;
}

export const groundedClock: FlightClock = { elapsed: 0, lastTick: null };

/**
 * One frame of a ride in flight. While unfocused, hidden, or off screen it
 * holds in place (the clock stops, so nothing jumps when it resumes); Reduce
 * Motion lands it. A stalled frame never advances it by more than a beat.
 */
export function advanceFlight(
    clock: FlightClock,
    now: number,
    signals: WatchSignals
): { clock: FlightClock; mode: 'grounded' | 'held' | 'running' } {
    if (signals.reducedMotion) {
        return { clock, mode: 'grounded' };
    }
    if (!isWatched(signals)) {
        return { clock: { elapsed: clock.elapsed, lastTick: null }, mode: 'held' };
    }
    const step = clock.lastTick === null ? 0 : Math.min(now - clock.lastTick, 250) / 1000;
    return { clock: { elapsed: clock.elapsed + step, lastTick: now }, mode: 'running' };
}

function isWatched(signals: WatchSignals): boolean {
    return signals.focused && signals.visible && signals.onScreen;
}
