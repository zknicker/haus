import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import type { Root } from 'react-dom/client';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { useAfterFirstPaint, useRevealLatch } from './use-agent-hub-reveal.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

test('a hub whose reads are cached reveals in its first render', async () => {
    const probe = await mount(true, 1000);
    expect(probe.seen()).toEqual([true]);
    await probe.unmount();
});

test('a hub reveals once its reads settle, and never hides again', async () => {
    const probe = await mount(false, 1000);
    expect(probe.seen().at(-1)).toBe(false);
    await probe.render(true);
    expect(probe.seen().at(-1)).toBe(true);
    await probe.render(false);
    expect(probe.seen().at(-1)).toBe(true);
    await probe.unmount();
});

test('a slow read cannot hold the hub past the delay', async () => {
    const probe = await mount(false, 10);
    await probe.wait(30);
    expect(probe.seen().at(-1)).toBe(true);
    await probe.unmount();
});

test('heavy hub content waits for the frame after the chrome paints', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const frames: FrameRequestCallback[] = [];
    const scope = window as unknown as Record<string, unknown>;
    const previous = [scope.requestAnimationFrame, scope.cancelAnimationFrame];
    scope.requestAnimationFrame = (callback: FrameRequestCallback) => frames.push(callback);
    scope.cancelAnimationFrame = () => undefined;
    const seen: boolean[] = [];
    function Probe() {
        seen.push(useAfterFirstPaint());
        return null;
    }
    const root = createRoot(document.createElement('div') as unknown as Element);
    try {
        await act(async () => root.render(<Probe />));
        // Committed and effects flushed, but no frame yet: still only the chrome.
        expect(seen.at(-1)).toBe(false);
        await act(async () => {
            for (const frame of frames.splice(0)) {
                frame(0);
            }
            await new Promise((resolve) => setTimeout(resolve, 5));
        });
        expect(seen.at(-1)).toBe(true);
    } finally {
        await act(async () => root.unmount());
        [scope.requestAnimationFrame, scope.cancelAnimationFrame] = previous;
    }
});

async function mount(ready: boolean, delayMs: number) {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const seen: boolean[] = [];
    function Probe({ isReady }: { isReady: boolean }) {
        seen.push(useRevealLatch(isReady, delayMs));
        return null;
    }
    let root: Root | undefined;
    const render = async (isReady: boolean) => {
        await act(async () => {
            root ??= createRoot(document.createElement('div') as unknown as Element);
            root.render(<Probe isReady={isReady} />);
        });
    };
    await render(ready);
    return {
        render,
        seen: () => seen,
        unmount: async () => {
            await act(async () => root?.unmount());
        },
        wait: async (ms: number) => {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, ms));
            });
        },
    };
}
