import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autoScrollStep } from './tab-drag-autoscroll.ts';
import {
    type BandLayout,
    draggedLeft,
    hiddenTabs,
    type RowLayout,
    resolveSlot,
} from './tab-drag-geometry.ts';

/**
 * A crowded row: ten 100px tabs 4px apart, scrolled 208px, so the list shows
 * x 0–400: t0 and t1 sit off its left edge, t5 on reach past its right edge.
 */
function crowded(key: RowLayout['row'] = 'primary', scroll = 208): RowLayout {
    return {
        bounds: { bottom: 40, left: 0, right: 440, top: 0 },
        gap: 4,
        port: { left: 0, right: 400 },
        row: key,
        start: -scroll,
        tabs: Array.from({ length: 10 }, (_, index) => ({
            id: `t${index}`,
            left: -scroll + index * 104,
            width: 100,
        })),
    };
}

function band(rows: RowLayout[]): BandLayout {
    return { band: { bottom: 40, left: 0, right: 1200, top: 0 }, rows, viewportWidth: 1200 };
}

test('a crowded row reports how far its other tabs reach past what it shows', () => {
    expect(hiddenTabs(crowded(), [])).toEqual({ after: 428, before: 208 });
    // The dragged tabs never count: a block half hidden at the row's end is not pulled in.
    const end = { ...crowded(), tabs: crowded().tabs.slice(4, 6) };
    expect(hiddenTabs(end, ['t5'])).toEqual({ after: 0, before: 0 });
});

test('in a crowded row the dragged tab stays glued while its slot stops at what shows', () => {
    const layout = band([crowded()]);
    // t3 rests at 104; grabbed 30px in and pulled to the row's left edge and past it.
    const input = { draggedIds: ['t3'], draggedWidth: 100, grabX: 30 };
    const at = (x: number) => ({ ...input, pointer: { x, y: 20 } });
    expect(draggedLeft(layout, at(10))).toBe(-20);
    // The scrolled-off t0, t1 slots are out of reach: the first shown slot (t2's) is the limit.
    expect(resolveSlot(layout, at(10))).toEqual({ index: 2, row: 'primary' });
    expect(resolveSlot(layout, at(-200))).toEqual({ index: 2, row: 'primary' });
    // Past the right edge it stops at the last slot that fits the shown span.
    expect(resolveSlot(layout, at(1000))).toEqual({ index: 5, row: 'primary' });
});

test('the row scrolls under a pointer pressing its shown edge, faster the further it pushes', () => {
    const layout = band([crowded()]);
    const step = (pointerX: number) =>
        autoScrollStep(layout, 'primary', { draggedIds: ['t3'], pointerX });
    expect(step(200)).toBe(0);
    expect(step(20)).toBeLessThan(0);
    expect(step(-40)).toBeLessThan(step(20));
    expect(step(390)).toBeGreaterThan(0);
    expect(step(460)).toBeGreaterThan(step(390));
    // Never further than the row has left to scroll.
    const nearlyStart = band([crowded('primary', 3)]);
    expect(autoScrollStep(nearlyStart, 'primary', { draggedIds: ['t3'], pointerX: -100 })).toBe(-3);
});

test('an edge facing the other row scrolls only while the pointer is still in the row', () => {
    const right = {
        ...crowded('secondary'),
        bounds: { bottom: 40, left: 600, right: 1200, top: 0 },
    };
    const layout = band([crowded(), right]);
    const step = (pointerX: number) =>
        autoScrollStep(layout, 'primary', { draggedIds: ['t3'], pointerX });
    expect(step(390)).toBeGreaterThan(0);
    // Over the new-tab button, heading for the right pane's row.
    expect(step(420)).toBe(0);
});

test('a drag never unclips a row: its dragged tabs draw on the band layer instead', () => {
    // Unclipping the list while a tab dragged dropped a crowded row's scroll (it jumped ~174px).
    const theme = readFileSync(join(import.meta.dir, '../../../styles/default-theme.css'), 'utf8');
    expect(theme).not.toMatch(/\.workspace-tab-list[^{]*\{[^}]*overflow:\s*visible/);
    expect(theme).toMatch(/\.workspace-tab\[data-drag-mirrored\]\s*\{[^}]*opacity:\s*0/);
});
