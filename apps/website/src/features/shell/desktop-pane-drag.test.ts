import { afterEach, beforeEach, expect, test } from 'bun:test';
import { browserViewsCovered } from '../../lib/desktop-browser.ts';
import { beginDesktopPointerDrag } from './desktop-pane-drag.ts';

const realWindow = globalThis.window;

beforeEach(() => {
    globalThis.window = new EventTarget() as unknown as Window & typeof globalThis;
});

afterEach(() => {
    globalThis.window = realWindow;
});

test('a pointer drag covers every web view until the pointer is released', () => {
    beginDesktopPointerDrag();
    expect(browserViewsCovered()).toBe(true);
    window.dispatchEvent(new Event('pointerup'));
    expect(browserViewsCovered()).toBe(false);
});

test('a blur or an explicit end releases the cover exactly once', () => {
    const end = beginDesktopPointerDrag();
    const other = beginDesktopPointerDrag();
    window.dispatchEvent(new Event('blur'));
    expect(browserViewsCovered()).toBe(false);
    end();
    other();
    expect(browserViewsCovered()).toBe(false);
});
