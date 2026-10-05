import type { PaneSide } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { measureBand } from './tab-band-dom.ts';
import { type BandLayout, hiddenTabs, type Point } from './tab-drag-geometry.ts';
import type { TabDragState } from './tab-drag-machine.ts';

/** How close to a crowded row's shown edge the pointer starts scrolling it. */
const edgeZonePx = 24;
/** The fastest scroll, per frame, reached a further zone past the edge. */
const maxStepPx = 16;

/**
 * Chrome-style auto-scroll: while the pointer drags tabs near or past a
 * shown edge of the crowded row drawing them, that row scrolls toward its
 * hidden tabs every frame, faster the further the pointer pushes, and the
 * dragged block (held inside what shows) changes slot as the tabs pass. An
 * edge facing the other pane's row scrolls only while the pointer
 * is still inside the row, so crossing to the other row does not.
 */
export function createTabAutoScroll(
    band: () => HTMLElement | null,
    state: () => TabDragState,
    /** Re-resolves the drag at the pointer after the row moved under it. */
    move: (point: Point) => void
) {
    let frame = 0;

    const target = () => {
        const element = band();
        const drag = state();
        if (!(element && drag.phase === 'attached')) {
            return null;
        }
        const step = autoScrollStep(measureBand(element), drag.slot.row, {
            draggedIds: drag.tabIds,
            pointerX: drag.pointer.x,
        });
        const list = element.querySelector<HTMLElement>(
            `[data-tab-row="${drag.slot.row}"] .workspace-tab-list`
        );
        return step !== 0 && list ? { list, pointer: drag.pointer, step } : null;
    };

    return {
        /** After every move: keeps scrolling while the pointer presses an edge. */
        check() {
            if (frame !== 0 || !target()) {
                return;
            }
            frame = requestAnimationFrame(() => {
                frame = 0;
                const next = target();
                if (next) {
                    next.list.scrollLeft += next.step;
                    move(next.pointer);
                }
            });
        },
        stop() {
            cancelAnimationFrame(frame);
            frame = 0;
        },
    };
}

/** This frame's scroll of the row drawing the dragged tabs, in px (negative scrolls left); 0 for none. */
export function autoScrollStep(
    layout: BandLayout,
    row: PaneSide,
    { draggedIds, pointerX }: { draggedIds: readonly string[]; pointerX: number }
): number {
    const rows = [...layout.rows].sort((a, b) => a.bounds.left - b.bounds.left);
    const drawing = rows.find((candidate) => candidate.row === row);
    if (!drawing) {
        return 0;
    }
    const hidden = hiddenTabs(drawing, draggedIds);
    const { port } = drawing;
    const mayScrollStart = rows[0] === drawing || pointerX >= port.left;
    const mayScrollEnd = rows.at(-1) === drawing || pointerX <= port.right;
    const pastStart = edgeZonePx - (pointerX - port.left);
    const pastEnd = edgeZonePx - (port.right - pointerX);
    if (hidden.before > 0 && mayScrollStart && pastStart > 0) {
        return -Math.min(hidden.before, speed(pastStart));
    }
    if (hidden.after > 0 && mayScrollEnd && pastEnd > 0) {
        return Math.min(hidden.after, speed(pastEnd));
    }
    return 0;
}

function speed(depth: number): number {
    return Math.max(1, Math.round(Math.min(1, depth / (2 * edgeZonePx)) * maxStepPx));
}
