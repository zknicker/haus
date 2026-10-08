import { afterAll, beforeAll, expect, test } from 'bun:test';
import * as React from 'react';
import { installFakeDom } from '../../test-support/fake-dom.ts';
import { WorkspaceTabLabel } from './workspace-tab.tsx';

const observers: FakeResizeObserver[] = [];
let widthReads = 0;
let scrollWidth = 50;

class FakeResizeObserver {
    readonly callback: () => void;
    observed = 0;
    disconnected = false;
    constructor(callback: () => void) {
        this.callback = callback;
        observers.push(this);
    }
    observe() {
        this.observed += 1;
    }
    disconnect() {
        this.disconnected = true;
    }
}

let restoreDom: () => void;
const scope = globalThis as Record<string, unknown>;
const savedObserver = scope.ResizeObserver;
beforeAll(() => {
    restoreDom = installFakeDom();
    scope.ResizeObserver = FakeResizeObserver;
    const prototype = (scope.HTMLElement as { prototype: object }).prototype;
    Object.defineProperty(prototype, 'scrollWidth', {
        configurable: true,
        get: () => {
            widthReads += 1;
            return scrollWidth;
        },
    });
    Object.defineProperty(prototype, 'clientWidth', { configurable: true, get: () => 100 });
});
afterAll(() => {
    scope.ResizeObserver = savedObserver;
    restoreDom();
});

// A tab switch renames tabs; reading the label's width in the commit forced a
// synchronous style and layout of the whole window on every switch.
test('a tab label measures overflow only in its observer, re-observing on a new title', async () => {
    const { act } = React;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    const root = createRoot(container);
    const label = () => container.childNodes[0] as unknown as HTMLElement;

    await act(() => root.render(<WorkspaceTabLabel>general</WorkspaceTabLabel>));
    expect(widthReads).toBe(0);
    expect(observers).toHaveLength(1);
    expect(observers[0]?.observed).toBe(1);

    scrollWidth = 150;
    await act(() => root.render(<WorkspaceTabLabel>a much longer channel name</WorkspaceTabLabel>));
    expect(widthReads).toBe(0);
    expect(observers[0]?.disconnected).toBe(true);
    expect(observers).toHaveLength(2);

    // The fresh observer's first notification measures the new title.
    await act(() => observers[1]?.callback());
    expect(widthReads).toBe(1);
    expect(label().getAttribute('data-overflowing')).toBe('true');

    await act(() => root.unmount());
});
