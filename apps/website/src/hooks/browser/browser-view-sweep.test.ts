import { expect, test } from 'bun:test';
import { createViewSweeper } from './browser-view-sweep.ts';

test('a view no tab names closes only after it stays unnamed for the grace period', () => {
    const sweeper = createViewSweeper(500);
    expect(sweeper.sweep(['v1'], new Set(), 0)).toEqual([]);
    expect(sweeper.sweep(['v1'], new Set(), 499)).toEqual([]);
    expect(sweeper.sweep(['v1'], new Set(), 500)).toEqual(['v1']);
});

test('a view that arrives before the tab naming it survives once the tab lands', () => {
    const sweeper = createViewSweeper(500);
    // Tab drag: the page shows up here a moment before its tab is adopted.
    expect(sweeper.sweep(['v1'], new Set(), 0)).toEqual([]);
    expect(sweeper.sweep(['v1'], new Set(['v1']), 10)).toEqual([]);
    // Named again resets the clock: a later unnaming waits a full grace period.
    expect(sweeper.sweep(['v1'], new Set(), 600)).toEqual([]);
    expect(sweeper.sweep(['v1'], new Set(), 1099)).toEqual([]);
    expect(sweeper.sweep(['v1'], new Set(), 1100)).toEqual(['v1']);
});

test('a view that leaves the window is forgotten', () => {
    const sweeper = createViewSweeper(500);
    sweeper.sweep(['v1'], new Set(), 0);
    expect(sweeper.sweep([], new Set(), 100)).toEqual([]);
    expect(sweeper.sweep(['v1'], new Set(), 700)).toEqual([]);
});
