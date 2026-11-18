import { expect, test } from 'bun:test';
import type {
    DesktopTabsState,
    PaneSide,
    PaneState,
} from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import {
    type BandLayout,
    blockWidth,
    draggedBoxes,
    dragOffset,
    resolveSlot,
} from './tab-drag-geometry.ts';
import { projectRow } from './tab-drag-projection.ts';

/**
 * The row handoff end to end: each step lays the rows out from the
 * projection (as the DOM would after React commits), then paints the dragged
 * tab the way the engine does. Wherever its row changes, the painted left
 * must stay exactly pointer minus grab.
 */

function windowTabs(primary: string[], secondary: string[]): DesktopTabsState {
    const pane = (ids: string[]): PaneState => ({ selectedTabId: ids[0] ?? '', tabIds: ids });
    return {
        closed: [],
        focusedPane: 'primary',
        mru: [],
        primary: pane(primary),
        secondary: pane(secondary),
        tabs: {},
    };
}

/** The left row spans 0–600 with 150px tabs; the right row 600–1200 with 100px tabs. */
const rowShapes = {
    primary: { left: 0, right: 600, tabWidth: 150 },
    secondary: { left: 600, right: 1200, tabWidth: 100 },
} as const;
const gap = 4;

function layoutOf(
    state: DesktopTabsState,
    drag: { slot: { index: number; row: PaneSide }; tabIds: readonly string[] }
): BandLayout {
    const rows = (['primary', 'secondary'] as const).map((key) => {
        const shape = rowShapes[key];
        const ids = projectRow(state, key, drag);
        return {
            bounds: { bottom: 40, left: shape.left, right: shape.right, top: 0 },
            gap,
            port: { left: shape.left, right: shape.right },
            row: key,
            start: shape.left,
            tabs: ids.map((id, index) => ({
                id,
                left: shape.left + index * (shape.tabWidth + gap),
                width: shape.tabWidth,
            })),
        };
    });
    return { band: { bottom: 40, left: 0, right: 1200, top: 0 }, rows, viewportWidth: 1200 };
}

function paintedLeft(layout: BandLayout, tabId: string, offset: number): number {
    const box = layout.rows.flatMap((row) => row.tabs).find((tab) => tab.id === tabId);
    return (box?.left ?? Number.NaN) + offset;
}

function sweep(
    state: DesktopTabsState,
    origin: { index: number; row: PaneSide },
    tabIds: readonly string[],
    grabX: number,
    xs: number[]
) {
    let drag = { slot: origin, tabIds };
    const rowsSeen = new Set<PaneSide>();
    for (const x of xs) {
        const pointer = { x, y: 20 };
        const before = layoutOf(state, drag);
        const width = blockWidth(before, draggedBoxes(before, tabIds));
        const slot = resolveSlot(before, {
            draggedIds: tabIds,
            draggedWidth: width,
            grabX,
            pointer,
        });
        drag = { slot: slot ?? drag.slot, tabIds };
        rowsSeen.add(drag.slot.row);
        // React commits the new projection; the engine repaints against it.
        const after = layoutOf(state, drag);
        const offset = dragOffset(after, { draggedIds: tabIds, grabX, pointer });
        expect(offset).not.toBeNull();
        expect(paintedLeft(after, tabIds[0] ?? '', offset ?? 0)).toBe(x - grabX);
    }
    return rowsSeen;
}

test('crossing into the other row never moves the dragged tab off the pointer', () => {
    const state = windowTabs(['a', 'b'], ['c', 'd']);
    const xs = Array.from({ length: 60 }, (_, step) => 20 + step * 10);
    expect(sweep(state, { index: 0, row: 'primary' }, ['a'], 20, xs)).toEqual(
        new Set<PaneSide>(['primary', 'secondary'])
    );
});

test('crossing back keeps the grab point under the pointer too', () => {
    const state = windowTabs(['a', 'b'], ['c', 'd']);
    const xs = Array.from({ length: 60 }, (_, step) => 610 - step * 10);
    expect(sweep(state, { index: 0, row: 'secondary' }, ['c'], 20, xs).has('primary')).toBe(true);
});

test('a row the tab leaves empty still hands it over cleanly', () => {
    const state = windowTabs(['a'], ['c']);
    const xs = Array.from({ length: 50 }, (_, step) => 20 + step * 12);
    expect(sweep(state, { index: 0, row: 'primary' }, ['a'], 20, xs)).toEqual(
        new Set<PaneSide>(['primary', 'secondary'])
    );
});

test('a dragged multi-selection rides as one block across rows, its first tab at the pointer', () => {
    const state = windowTabs(['a', 'b', 'e'], ['c', 'd']);
    const xs = Array.from({ length: 60 }, (_, step) => 20 + step * 10);
    expect(sweep(state, { index: 0, row: 'primary' }, ['a', 'b'], 20, xs)).toEqual(
        new Set<PaneSide>(['primary', 'secondary'])
    );
});
