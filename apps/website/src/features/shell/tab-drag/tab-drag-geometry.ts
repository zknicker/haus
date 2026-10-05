import type { PaneSide } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';

/**
 * Pure geometry for dragging a tab along the window band (ADR 0039), all in
 * client CSS px. The DOM is measured once per pointer move into a
 * `BandLayout`; everything here decides from that snapshot.
 */

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    bottom: number;
    left: number;
    right: number;
    top: number;
}

export interface Span {
    left: number;
    right: number;
}

/** Where the dragged tabs sit: the first one's index among the row's other tabs. */
export interface Slot {
    index: number;
    row: PaneSide;
}

/** One tab's layout box: its untransformed position, so animations never skew the math. */
export interface TabBox {
    id: string;
    left: number;
    width: number;
}

export interface RowLayout {
    /** The whole row, new-tab button included: the horizontal span the row claims. */
    bounds: Rect;
    /** The space between neighboring tabs. */
    gap: number;
    /**
     * The span of the row's tab list that shows tabs: narrower than its tabs
     * when the row is crowded, which scrolls it (`tab-reveal.ts`).
     */
    port: Span;
    row: PaneSide;
    /** The first slot's left edge, also when the row has no tabs. */
    start: number;
    tabs: readonly TabBox[];
}

export interface BandLayout {
    /** Every tab row of the window band together. */
    band: Rect;
    rows: readonly RowLayout[];
    viewportWidth: number;
}

/** Pointer travel before a press becomes a drag. */
export const dragActivationPx = 5;
/** How far outside the band the pointer may stray before the tab tears off. */
export const detachThresholdPx = 25;

export function isDragActivated(start: Point, current: Point): boolean {
    return Math.hypot(current.x - start.x, current.y - start.y) >= dragActivationPx;
}

/**
 * Tear-off: more than the threshold above or below the band, or off either
 * side of the window. Inside that margin the tab stays on its row.
 */
export function shouldDetach(pointer: Point, layout: BandLayout): boolean {
    const { band, viewportWidth } = layout;
    return (
        pointer.y < band.top - detachThresholdPx ||
        pointer.y > band.bottom + detachThresholdPx ||
        pointer.x < -detachThresholdPx ||
        pointer.x > viewportWidth + detachThresholdPx
    );
}

/** The row whose span holds `x`, else the nearest one. */
export function rowAt(rows: readonly RowLayout[], x: number): RowLayout | null {
    let nearest: RowLayout | null = null;
    let distance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
        if (x >= row.bounds.left && x <= row.bounds.right) {
            return row;
        }
        const away = x < row.bounds.left ? row.bounds.left - x : x - row.bounds.right;
        if (away < distance) {
            distance = away;
            nearest = row;
        }
    }
    return nearest;
}

/**
 * Chrome's insertion rule (`TabStrip::CalculateInsertionIndex`): the slot
 * whose resting left edge is nearest the dragged block's painted left edge.
 * Resting edges pack the row's other tabs from `start` as if the block sat at
 * that slot, so the answer never depends on where the block is drawn now: a
 * block of any width swaps with a neighbor once it has covered half the
 * neighbor's step, and swaps back at the same point.
 */
export function slotIndex(
    left: number,
    row: Pick<RowLayout, 'gap' | 'start'>,
    others: readonly TabBox[]
): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let edge = row.start;
    for (let index = 0; index <= others.length; index += 1) {
        const distance = Math.abs(left - edge);
        if (distance < bestDistance) {
            best = index;
            bestDistance = distance;
        }
        edge += (others[index]?.width ?? 0) + row.gap;
    }
    return best;
}

/**
 * What rides the pointer: one tab or a multi-selection drawn side by side
 * (Chrome gathers dragged tabs), `width` wide with its gaps, held `grabX` from
 * its left edge.
 */
export interface DraggedBlock {
    draggedIds: readonly string[];
    draggedWidth: number;
    grabX: number;
    pointer: Point;
}

/** The slot under the pointer, holding the dragged tabs at their grab offset. */
export function resolveSlot(layout: BandLayout, input: DraggedBlock): Slot | null {
    const row = rowAt(layout.rows, input.pointer.x);
    if (!row) {
        return null;
    }
    const others = row.tabs.filter((tab) => !input.draggedIds.includes(tab.id));
    return { index: slotIndex(shownLeft(layout, input), row, others), row: row.row };
}

/**
 * Where the dragged block's left edge is painted, in client px: under the
 * pointer at the grab offset, clamped between the band's first slot and its
 * last (after every other tab of the rightmost row) — never to its own row —
 * so it glides from one row to the next without a jump. Which row draws it,
 * and that row's tab width, never move the limits.
 */
export function draggedLeft(layout: BandLayout, input: DraggedBlock): number {
    // A narrower tab than the grab offset keeps the pointer on its far edge.
    const wanted = input.pointer.x - Math.min(input.grabX, input.draggedWidth);
    const rows = [...layout.rows].sort((a, b) => a.bounds.left - b.bounds.left);
    const first = rows[0];
    const last = rows.at(-1);
    if (!(first && last)) {
        return wanted;
    }
    const others = last.tabs.filter((tab) => !input.draggedIds.includes(tab.id));
    const end = others.length
        ? Math.max(...others.map((tab) => tab.left + tab.width)) + last.gap
        : last.start;
    return Math.min(Math.max(wanted, first.start), Math.max(first.start, end));
}

/**
 * The dragged left edge the slot is chosen from: the painted one, held
 * inside what a crowded outer row shows. Its scrolled-off slots are reached
 * by scrolling the row under the pointer (`tab-drag-autoscroll.ts`), never by
 * reaching past its edge. Only the paint follows the pointer past it, so the
 * block stays glued.
 */
export function shownLeft(layout: BandLayout, input: DraggedBlock): number {
    const left = draggedLeft(layout, input);
    const rows = [...layout.rows].sort((a, b) => a.bounds.left - b.bounds.left);
    const first = rows[0];
    const last = rows.at(-1);
    if (!(first && last)) {
        return left;
    }
    const low = hiddenTabs(first, input.draggedIds).before > 0 ? first.port.left : left;
    const high =
        hiddenTabs(last, input.draggedIds).after > 0 ? last.port.right - input.draggedWidth : left;
    return Math.min(Math.max(left, low), Math.max(low, high));
}

/**
 * How far a row's other tabs reach past its shown span on each side: the
 * slots a drag can only reach by scrolling the row. The dragged tabs do not
 * count, so a block that starts half hidden at the row's end is not pulled
 * into view. Read from layout boxes, so a dragged tab's paint offset (which
 * the browser counts as scrollable overflow) never makes a row look crowded.
 */
export function hiddenTabs(
    row: Pick<RowLayout, 'port' | 'tabs'>,
    draggedIds: readonly string[]
): { after: number; before: number } {
    const others = row.tabs.filter((tab) => !draggedIds.includes(tab.id));
    if (others.length === 0) {
        return { after: 0, before: 0 };
    }
    const left = Math.min(...others.map((tab) => tab.left));
    const right = Math.max(...others.map((tab) => tab.left + tab.width));
    return {
        after: Math.max(0, Math.round(right - row.port.right)),
        before: Math.max(0, Math.round(row.port.left - left)),
    };
}

/**
 * The dragged tabs' translateX from their resting slots in whichever row
 * draws them, so the block's painted left is `draggedLeft`; null while no row
 * draws them. They rest side by side at their slot, so one offset moves all.
 */
export function dragOffset(
    layout: BandLayout,
    input: Omit<DraggedBlock, 'draggedWidth'>
): number | null {
    const boxes = draggedBoxes(layout, input.draggedIds);
    const first = boxes[0];
    if (!first) {
        return null;
    }
    return draggedLeft(layout, { ...input, draggedWidth: blockWidth(layout, boxes) }) - first.left;
}

/** The dragged tabs' boxes as drawn, in order. */
export function draggedBoxes(layout: BandLayout, draggedIds: readonly string[]): TabBox[] {
    const all = layout.rows.flatMap((row) => row.tabs);
    return draggedIds.flatMap((id) => all.filter((tab) => tab.id === id));
}

/** The width of tabs drawn side by side: their widths plus the gaps between them. */
export function blockWidth(layout: BandLayout, boxes: readonly TabBox[]): number {
    const gap =
        layout.rows.find((row) => row.tabs.some((tab) => tab.id === boxes[0]?.id))?.gap ?? 0;
    const widths = boxes.reduce((sum, box) => sum + box.width, 0);
    return widths + gap * Math.max(0, boxes.length - 1);
}
