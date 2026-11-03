import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { clockStart, type FrameMode, frameMs, startFrameLoop } from './frame-loop.ts';

// The loop's contract, driven against fake browser globals: it draws only
// while it can be seen, holds its frame while blurred, shows one still frame
// under reduced motion, and leaves nothing behind when stopped.

type Listener = (event: Event) => void;

function eventTarget() {
    const listeners = new Map<string, Set<Listener>>();
    return {
        addEventListener: (type: string, listener: Listener) => {
            listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
        },
        count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
        dispatch: (type: string) => {
            for (const listener of listeners.get(type) ?? []) {
                listener({ type } as Event);
            }
        },
        removeEventListener: (type: string, listener: Listener) => {
            listeners.get(type)?.delete(listener);
        },
    };
}

let frames: Map<number, FrameRequestCallback>;
let focused: boolean;
let reduced: boolean;
let saved: Record<string, unknown>;
const globalNames = [
    'document',
    'window',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'IntersectionObserver',
    'MutationObserver',
] as const;
const docEvents = eventTarget();
const windowEvents = eventTarget();
const motionEvents = eventTarget();

beforeEach(() => {
    frames = new Map();
    focused = true;
    reduced = false;
    let nextFrame = 1;
    const globals = globalThis as Record<string, unknown>;
    saved = Object.fromEntries(globalNames.map((name) => [name, globals[name]]));
    class FakeObserver {
        observe() {}
        disconnect() {}
    }
    Object.assign(globals, {
        cancelAnimationFrame: (id: number) => frames.delete(id),
        document: {
            ...docEvents,
            documentElement: { classList: { contains: () => false } },
            hasFocus: () => focused,
            hidden: false,
        },
        IntersectionObserver: FakeObserver,
        MutationObserver: FakeObserver,
        requestAnimationFrame: (callback: FrameRequestCallback) => {
            frames.set(nextFrame, callback);
            return nextFrame++;
        },
        window: {
            ...windowEvents,
            matchMedia: () => ({
                ...motionEvents,
                get matches() {
                    return reduced;
                },
            }),
        },
    });
});

afterEach(() => {
    Object.assign(globalThis, saved);
});

function flushFrames() {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) {
        callback(performance.now());
    }
}

const target = {} as Element;
const always = { displayRate: () => false, ready: () => true };

test('draws on its own clock while focused, and holds its frame while blurred', async () => {
    const draw = mock((_time: number, _mode: FrameMode) => undefined);
    const loop = startFrameLoop(target, draw, always);
    flushFrames();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]).toEqual([clockStart, 'running']);

    // Focused: the next frame is booked one beat later.
    await Bun.sleep(frameMs + 30);
    flushFrames();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[1]?.[0]).toBeGreaterThan(clockStart);

    focused = false;
    windowEvents.dispatch('blur');
    flushFrames();
    expect(draw).toHaveBeenCalledTimes(3);
    const held = draw.mock.calls[2]?.[0];
    expect(draw.mock.calls[2]?.[1]).toBe('held');
    // Blurred: the frame is held and nothing more is scheduled.
    await Bun.sleep(frameMs + 30);
    expect(frames.size).toBe(0);

    // A wake while blurred (a resize) redraws the held frame, on the held clock.
    loop.wake();
    flushFrames();
    expect(draw.mock.calls[3]).toEqual([held as number, 'held']);
    loop.stop();
});

test('runs every display frame while asked, then returns to its beat', () => {
    let burst = true;
    const draw = mock((_time: number, _mode: FrameMode) => undefined);
    const loop = startFrameLoop(target, draw, { displayRate: () => burst, ready: () => true });
    flushFrames();
    // No beat to wait for: the next display frame is already booked.
    expect(frames.size).toBe(1);
    flushFrames();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(1);

    burst = false;
    flushFrames();
    expect(draw).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(0);
    loop.stop();
});

test('display rate still stops while blurred', () => {
    focused = false;
    const draw = mock((_time: number, _mode: FrameMode) => undefined);
    const loop = startFrameLoop(target, draw, { displayRate: () => true, ready: () => true });
    flushFrames();
    expect(draw.mock.calls).toEqual([[clockStart, 'held']]);
    expect(frames.size).toBe(0);
    loop.stop();
});

test('reduced motion gets one still frame, redrawn only when woken', async () => {
    reduced = true;
    const draw = mock((_time: number, _mode: FrameMode) => undefined);
    const loop = startFrameLoop(target, draw, { ...always, displayRate: () => true });
    flushFrames();
    await Bun.sleep(frameMs + 30);
    expect(frames.size).toBe(0);
    expect(draw.mock.calls).toEqual([[clockStart, 'still']]);

    loop.wake();
    flushFrames();
    expect(draw.mock.calls).toEqual([
        [clockStart, 'still'],
        [clockStart, 'still'],
    ]);
    loop.stop();
});

test('draws nothing until the caller is ready', () => {
    let ready = false;
    const draw = mock((_time: number, _mode: FrameMode) => undefined);
    const loop = startFrameLoop(target, draw, { displayRate: () => false, ready: () => ready });
    flushFrames();
    expect(draw).not.toHaveBeenCalled();

    ready = true;
    loop.wake();
    flushFrames();
    expect(draw).toHaveBeenCalledTimes(1);
    loop.stop();
});

test('stopping cancels the next frame and removes every listener', () => {
    const loop = startFrameLoop(target, () => undefined, always);
    loop.stop();

    expect(frames.size).toBe(0);
    expect(docEvents.count()).toBe(0);
    expect(windowEvents.count()).toBe(0);
    expect(motionEvents.count()).toBe(0);
});
