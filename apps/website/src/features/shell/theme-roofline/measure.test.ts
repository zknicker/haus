import { expect, test } from 'bun:test';
import { bulbSpacing } from './geometry.ts';
import { measureRoofline } from './measure.ts';

test('on the band the bulbs start past the sidebar lead and leave room for every tab', () => {
    const tab = box(242, 482);
    const newTab = box(486, 514);
    const layout = measureRoofline(band({ controls: [tab, newTab], leadEnd: 236 }), 'band');

    expect(layout.leadEnd).toBe(236);
    expect(layout.bulbs.length).toBeGreaterThan(0);
    for (const { x } of layout.bulbs) {
        // None in the lead: the snow runs over it, the bulbs do not.
        expect(x).toBeGreaterThan(236);
        // None behind the tab or the New tab button.
        for (const control of [tab, newTab]) {
            const rect = control.getBoundingClientRect();
            expect(x < rect.left || x > rect.right).toBe(true);
        }
    }
    // Past the tabs the grid keeps its spacing.
    const after = layout.bulbs.filter(({ x }) => x > 514).map(({ x }) => x);
    expect(after.slice(1).map((x, index) => x - (after[index] ?? 0))).toEqual(
        after.slice(1).map(() => bulbSpacing)
    );
});

function band({ controls, leadEnd }: { controls: Stub[]; leadEnd: number }): HTMLElement {
    const lead = box(0, leadEnd);
    const titlebar = { ...box(leadEnd, 1000), querySelectorAll: () => controls };
    const parent = {
        querySelector: (selector: string) =>
            selector.includes('shell-window-band__lead') ? lead : titlebar,
    };
    return { ...box(0, 1000), parentElement: parent } as unknown as HTMLElement;
}

interface Stub {
    getBoundingClientRect: () => { height: number; left: number; right: number; width: number };
}

function box(left: number, right: number): Stub {
    return { getBoundingClientRect: () => ({ height: 44, left, right, width: right - left }) };
}
