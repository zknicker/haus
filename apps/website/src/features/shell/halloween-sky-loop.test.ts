import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

// The loop's contract, driven against fake browser globals and a fake renderer:
// it draws only while it can be seen, pauses on blur, survives context loss,
// and leaves nothing behind when stopped.

const renderers: { disposed: number; draws: number }[] = [];
mock.module('./halloween-sky-gl.ts', () => ({
    createSkyRenderer: () => {
        const renderer = { disposed: 0, draws: 0 };
        renderers.push(renderer);
        return {
            dispose: () => {
                renderer.disposed += 1;
            },
            draw: () => {
                renderer.draws += 1;
            },
        };
    },
}));

const { startSkyLoop } = await import('./halloween-sky-loop.ts');

type Listener = (event: Event) => void;

function eventTarget() {
    const listeners = new Map<string, Set<Listener>>();
    return {
        addEventListener: (type: string, listener: Listener) => {
            listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
        },
        count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
        dispatch: (type: string) => {
            const event = { preventDefault: mock(() => undefined), type } as unknown as Event;
            for (const listener of listeners.get(type) ?? []) {
                listener(event);
            }
            return event;
        },
        removeEventListener: (type: string, listener: Listener) => {
            listeners.get(type)?.delete(listener);
        },
    };
}

let frames: Map<number, FrameRequestCallback>;
let focused: boolean;
let saved: Record<string, unknown>;
const globalNames = [
    'document',
    'window',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'ResizeObserver',
    'IntersectionObserver',
    'MutationObserver',
] as const;
const docEvents = eventTarget();
const windowEvents = eventTarget();

beforeEach(() => {
    renderers.length = 0;
    frames = new Map();
    focused = true;
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
        ResizeObserver: FakeObserver,
        window: {
            ...windowEvents,
            devicePixelRatio: 2,
            matchMedia: () => ({ ...eventTarget(), matches: false }),
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

function fakeCanvas() {
    return { ...eventTarget(), clientHeight: 40, clientWidth: 200 };
}

test('draws while visible and focused, and holds still while blurred', async () => {
    const canvas = fakeCanvas();
    const stop = startSkyLoop(canvas as unknown as HTMLCanvasElement, {
        inset: 74,
        radius: 14,
        y: 17,
    });
    flushFrames();
    expect(renderers[0]?.draws).toBe(1);

    focused = false;
    windowEvents.dispatch('blur');
    flushFrames();
    expect(renderers[0]?.draws).toBe(2);
    // Blurred: the frame is held and nothing more is scheduled.
    await Bun.sleep(130);
    expect(frames.size).toBe(0);

    stop?.();
});

test('rebuilds on a restored context instead of going blank for good', () => {
    const canvas = fakeCanvas();
    const stop = startSkyLoop(canvas as unknown as HTMLCanvasElement, {
        inset: 74,
        radius: 14,
        y: 17,
    });
    flushFrames();

    const lost = canvas.dispatch('webglcontextlost');
    // Without preventDefault the browser never restores the context.
    expect(lost.preventDefault).toHaveBeenCalled();
    windowEvents.dispatch('focus');
    flushFrames();
    expect(renderers[0]?.draws).toBe(1);

    canvas.dispatch('webglcontextrestored');
    flushFrames();
    expect(renderers).toHaveLength(2);
    expect(renderers[1]?.draws).toBe(1);

    stop?.();
    expect(renderers[1]?.disposed).toBe(1);
});

test('stopping disposes the renderer and removes every listener', () => {
    const canvas = fakeCanvas();
    const stop = startSkyLoop(canvas as unknown as HTMLCanvasElement, {
        inset: 74,
        radius: 14,
        y: 17,
    });
    stop?.();

    expect(renderers[0]?.disposed).toBe(1);
    expect(canvas.count()).toBe(0);
    expect(docEvents.count()).toBe(0);
    expect(windowEvents.count()).toBe(0);
    expect(frames.size).toBe(0);
});
