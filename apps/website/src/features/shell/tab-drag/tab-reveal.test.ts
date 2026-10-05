import { expect, test } from 'bun:test';
import { revealScrollLeft } from './tab-reveal.ts';

const port = { clientWidth: 300, scrollLeft: 0 };

test('a dropped tab resting inside the row scrolls nothing, wherever it is painted', () => {
    // Regression: the reveal read the painted box of a tab still settling from
    // the pointer and scrolled the row, jolting its left neighbor.
    expect(revealScrollLeft(port, { left: 200, width: 100 })).toBeNull();
});

test('a tab past the right edge scrolls just far enough', () => {
    expect(revealScrollLeft(port, { left: 260, width: 100 })).toBe(60);
});

test('a tab before the scrolled start scrolls back to it', () => {
    expect(revealScrollLeft({ clientWidth: 300, scrollLeft: 120 }, { left: 80, width: 100 })).toBe(
        80
    );
});

test('a tab wider than the row aligns its start', () => {
    expect(revealScrollLeft(port, { left: 40, width: 400 })).toBe(40);
    expect(
        revealScrollLeft({ clientWidth: 300, scrollLeft: 40 }, { left: 40, width: 400 })
    ).toBeNull();
});
