import { describe, expect, test } from 'bun:test';
import { clampSplitPaneWidth } from './use-split-pane-width.ts';

describe('clampSplitPaneWidth', () => {
    test('a wide row clamps to the split limits', () => {
        expect(clampSplitPaneWidth(2000, 3000)).toBe(960);
        expect(clampSplitPaneWidth(100, 3000)).toBe(420);
        expect(clampSplitPaneWidth(560.4, null)).toBe(560);
    });

    test('the split never takes the main column below its minimum', () => {
        expect(clampSplitPaneWidth(960, 1000)).toBe(640);
        expect(clampSplitPaneWidth(560, 900)).toBe(540);
    });

    test('a row too narrow for both minimums shrinks the split, not main, down to a floor', () => {
        expect(clampSplitPaneWidth(560, 700)).toBe(340);
        expect(clampSplitPaneWidth(560, 500)).toBe(280);
    });
});
