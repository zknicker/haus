import { describe, expect, test } from 'bun:test';
import { clampSidePaneWidth } from './use-side-pane-width.ts';

describe('clampSidePaneWidth', () => {
    test('a wide row clamps to the side pane limits', () => {
        expect(clampSidePaneWidth(2000, 3000)).toBe(960);
        expect(clampSidePaneWidth(100, 3000)).toBe(420);
        expect(clampSidePaneWidth(560.4, null)).toBe(560);
    });

    test('the side pane never takes the main column below its minimum', () => {
        expect(clampSidePaneWidth(960, 1000)).toBe(640);
        expect(clampSidePaneWidth(560, 900)).toBe(540);
    });

    test('a row too narrow for both minimums shrinks the side pane, not the routed page, down to a floor', () => {
        expect(clampSidePaneWidth(560, 700)).toBe(340);
        expect(clampSidePaneWidth(560, 500)).toBe(280);
    });
});
