import { expect, test } from 'bun:test';
import {
    type BandLayout,
    draggedLeft,
    dragOffset,
    isDragActivated,
    type RowLayout,
    resolveSlot,
    rowAt,
    shouldDetach,
    slotIndex,
} from './tab-drag-geometry.ts';

/** Tabs 100px wide from x=0, 4px apart. */
function row(ids: string[], key: RowLayout['row'] = 'primary', left = 0, right = 600): RowLayout {
    return {
        bounds: { bottom: 40, left, right, top: 0 },
        gap: 4,
        port: { left, right },
        row: key,
        start: left,
        tabs: ids.map((id, index) => ({ id, left: left + index * 104, width: 100 })),
    };
}

function band(rows: RowLayout[]): BandLayout {
    return { band: { bottom: 40, left: 0, right: 1200, top: 0 }, rows, viewportWidth: 1200 };
}

test('a press becomes a drag after a few pixels of travel', () => {
    expect(isDragActivated({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(false);
    expect(isDragActivated({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(true);
});

test('vertical slack holds the tab on its row until 25px outside the band', () => {
    const layout = band([row(['a'])]);
    expect(shouldDetach({ x: 50, y: 64 }, layout)).toBe(false);
    expect(shouldDetach({ x: 50, y: 66 }, layout)).toBe(true);
    expect(shouldDetach({ x: 50, y: -26 }, layout)).toBe(true);
    expect(shouldDetach({ x: 1224, y: 20 }, layout)).toBe(false);
    expect(shouldDetach({ x: 1226, y: 20 }, layout)).toBe(true);
});

test('the slot is the one whose resting left edge is nearest the dragged left edge', () => {
    const others = row(['b', 'c']).tabs;
    const at = { gap: 4, start: 0 };
    // Resting edges 0, 104, 208: the slot changes halfway between them.
    expect(slotIndex(51, at, others)).toBe(0);
    expect(slotIndex(53, at, others)).toBe(1);
    expect(slotIndex(157, at, others)).toBe(2);
    expect(slotIndex(-80, at, others)).toBe(0);
    expect(slotIndex(900, at, others)).toBe(2);
});

test('a dragged pair swaps with a neighbor after half its step, either way, not half its own width', () => {
    // Measured mid-drag: a, [b c] dragged, d, e. The layout holds the pair's gap at slot 1.
    const layout = band([row(['a', 'b', 'c', 'd', 'e'])]);
    const pair = (x: number) =>
        resolveSlot(layout, {
            draggedIds: ['b', 'c'],
            draggedWidth: 204,
            grabX: 150,
            pointer: { x: 104 + 150 + x, y: 20 },
        });
    expect(pair(0)).toEqual({ index: 1, row: 'primary' });
    expect(pair(51)).toEqual({ index: 1, row: 'primary' });
    expect(pair(53)).toEqual({ index: 2, row: 'primary' });
    expect(pair(-51)).toEqual({ index: 1, row: 'primary' });
    expect(pair(-53)).toEqual({ index: 0, row: 'primary' });
    expect(pair(157)).toEqual({ index: 3, row: 'primary' });
});

test('the slot follows the row under the pointer, the nearest one past either end', () => {
    const rows = [row(['a', 'b']), row(['c', 'd'], 'secondary', 600, 1200)];
    expect(rowAt(rows, 700)?.row).toBe('secondary');
    expect(rowAt(rows, -40)?.row).toBe('primary');
    const layout = band(rows);
    // Grabbed 20px in, a's left edge at 660: nearer c's far edge (704) than the row start.
    expect(
        resolveSlot(layout, {
            draggedIds: ['a'],
            draggedWidth: 100,
            grabX: 20,
            pointer: { x: 680, y: 20 },
        })
    ).toEqual({ index: 1, row: 'secondary' });
});

test('the dragged tab follows the pointer 1:1 and stays clamped to the band', () => {
    const layout = band([row(['a', 'b', 'c'])]);
    const input = { draggedIds: ['b'], grabX: 30 };
    expect(dragOffset(layout, { ...input, pointer: { x: 164, y: 0 } })).toBe(30);
    // Far left: b's left edge stops at the band's first tab (0); b sits at 104.
    expect(dragOffset(layout, { ...input, pointer: { x: -400, y: 0 } })).toBe(-104);
    // Far right: stops at the last slot, one gap after c (312).
    expect(dragOffset(layout, { ...input, pointer: { x: 900, y: 0 } })).toBe(208);
    expect(dragOffset(layout, { ...input, draggedIds: ['z'], pointer: { x: 0, y: 0 } })).toBeNull();
});

test('past its own row, the dragged tab keeps following into the gap before the next', () => {
    // a and b end at 204; the right row's tabs start at 600.
    const layout = band([row(['a', 'b']), row(['c', 'd'], 'secondary', 600, 1200)]);
    const input = { draggedIds: ['b'], grabX: 30 };
    expect(dragOffset(layout, { ...input, pointer: { x: 430, y: 0 } })).toBe(400 - 104);
});

test('a grab offset wider than the tab keeps the pointer on its far edge', () => {
    const layout = band([row(['a', 'b', 'c'])]);
    expect(
        draggedLeft(layout, {
            draggedIds: ['b'],
            draggedWidth: 60,
            grabX: 90,
            pointer: { x: 200, y: 0 },
        })
    ).toBe(140);
});
