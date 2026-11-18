import { describe, expect, test } from 'bun:test';
import {
    type ArmInput,
    advanceFlight,
    type DepartureSignals,
    dayKey,
    departureDelayMs,
    departureGate,
    departureHour,
    groundedClock,
    shouldArm,
    type WatchSignals,
} from './schedule.ts';

const evening: ArmInput = {
    departureHour: 17,
    flownOn: null,
    forced: false,
    hour: 17,
    reducedMotion: false,
    today: '2026-12-24',
};

const watched: WatchSignals = {
    focused: true,
    onScreen: true,
    reducedMotion: false,
    visible: true,
};

const ready: DepartureSignals = {
    ...watched,
    atTop: true,
    ready: true,
    sinceLoadMs: 5000,
};

describe('departureHour', () => {
    test('the night ride leaves at 5pm, the light theme at noon', () => {
        expect(departureHour({ forcedMode: 'dark' })).toBe(17);
        expect(departureHour({ forcedMode: 'light' })).toBe(12);
    });
});

describe('dayKey', () => {
    test('pads month and day', () => {
        expect(dayKey({ day: 5, month: 1, year: 2027 })).toBe('2027-01-05');
    });
});

describe('shouldArm', () => {
    test('arms from the theme hour on, never before', () => {
        expect(shouldArm({ ...evening, hour: 16 })).toBe(false);
        expect(shouldArm({ ...evening, hour: 17 })).toBe(true);
        expect(shouldArm({ ...evening, hour: 23 })).toBe(true);
        expect(shouldArm({ ...evening, departureHour: 12, hour: 11 })).toBe(false);
        expect(shouldArm({ ...evening, departureHour: 12, hour: 12 })).toBe(true);
    });

    test('flies once a day', () => {
        expect(shouldArm({ ...evening, flownOn: '2026-12-24' })).toBe(false);
        expect(shouldArm({ ...evening, flownOn: '2026-12-23' })).toBe(true);
    });

    test('the debug flag forces a ride whatever the hour or record', () => {
        expect(shouldArm({ ...evening, flownOn: '2026-12-24', forced: true, hour: 9 })).toBe(true);
    });

    test('Reduce Motion never arms, even forced', () => {
        expect(shouldArm({ ...evening, reducedMotion: true })).toBe(false);
        expect(shouldArm({ ...evening, forced: true, reducedMotion: true })).toBe(false);
    });
});

describe('departureGate', () => {
    test('never in the window’s first second', () => {
        expect(departureGate({ ...ready, sinceLoadMs: 0 })).toBe('wait');
        expect(departureGate({ ...ready, sinceLoadMs: departureDelayMs - 1 })).toBe('wait');
        expect(departureGate({ ...ready, sinceLoadMs: departureDelayMs })).toBe('depart');
    });

    test('never starts unfocused, hidden, off screen, scrolled, or before the art is ready', () => {
        expect(departureGate({ ...ready, focused: false })).toBe('wait');
        expect(departureGate({ ...ready, visible: false })).toBe('wait');
        expect(departureGate({ ...ready, onScreen: false })).toBe('wait');
        expect(departureGate({ ...ready, atTop: false })).toBe('wait');
        expect(departureGate({ ...ready, ready: false })).toBe('wait');
    });

    test('Reduce Motion grounds an armed ride', () => {
        expect(departureGate({ ...ready, reducedMotion: true })).toBe('abort');
    });
});

describe('advanceFlight', () => {
    test('runs on the frame clock, capping a stalled frame at a beat', () => {
        let step = advanceFlight({ elapsed: 0, lastTick: 1000 }, 1016, watched);
        expect(step.mode).toBe('running');
        expect(step.clock.elapsed).toBeCloseTo(0.016);
        step = advanceFlight(step.clock, 3016, watched);
        expect(step.clock.elapsed).toBeCloseTo(0.266);
    });

    test('an unfocused window freezes the ride in place and resumes without a jump', () => {
        const flying = { elapsed: 2, lastTick: 5000 };
        const held = advanceFlight(flying, 9000, { ...watched, focused: false });
        expect(held.mode).toBe('held');
        expect(held.clock.elapsed).toBe(2);
        const later = advanceFlight(held.clock, 60_000, { ...watched, focused: false });
        expect(later.clock.elapsed).toBe(2);
        const resumed = advanceFlight(later.clock, 61_000, watched);
        expect(resumed.mode).toBe('running');
        expect(resumed.clock.elapsed).toBe(2);
        expect(advanceFlight(resumed.clock, 61_100, watched).clock.elapsed).toBeCloseTo(2.1);
    });

    test('a hidden document or an off-screen strip holds too', () => {
        expect(advanceFlight(groundedClock, 10, { ...watched, visible: false }).mode).toBe('held');
        expect(advanceFlight(groundedClock, 10, { ...watched, onScreen: false }).mode).toBe('held');
    });

    test('Reduce Motion lands a ride in flight', () => {
        const step = advanceFlight({ elapsed: 3, lastTick: 100 }, 116, {
            ...watched,
            reducedMotion: true,
        });
        expect(step.mode).toBe('grounded');
        expect(step.clock.elapsed).toBe(3);
    });
});
