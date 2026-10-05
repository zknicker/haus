import type { PaneSide } from '../../../hooks/desktop-tabs/desktop-tabs-model.ts';
import type { BandLayout, Point, Rect, RowLayout } from './tab-drag-geometry.ts';

/**
 * Reads the window band's DOM into the pure `BandLayout`. Rows mark
 * themselves `data-tab-row`; their `.workspace-tab-list` is the offset parent
 * of their tabs, so `offsetLeft` gives each tab's resting position untouched
 * by drag offsets or slide animations.
 */
export function measureBand(band: HTMLElement): BandLayout {
    const rows = [...band.querySelectorAll<HTMLElement>('[data-tab-row]')].flatMap((row) => {
        const measured = measureRow(row);
        return measured ? [measured] : [];
    });
    return { band: rectOf(band), rows, viewportWidth: window.innerWidth };
}

export function tabElement(band: HTMLElement, tabId: string): HTMLElement | null {
    return band.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(tabId)}"]`);
}

/** A typical tab's width, for a tab not yet drawn in this window. */
export function typicalTabWidth(layout: BandLayout): number {
    return layout.rows.flatMap((row) => row.tabs)[0]?.width ?? 160;
}

/**
 * Where a torn-off window's only tab will sit: this window's first row's
 * first slot, at the dragged tab's top. Every window shares the band layout.
 */
export function firstSlotPoint(layout: BandLayout, draggedTop: number): Point {
    const first = layout.rows[0];
    const left = first ? Math.min(...first.tabs.map((tab) => tab.left), first.bounds.right) : 0;
    return { x: Number.isFinite(left) ? left : 0, y: draggedTop };
}

function measureRow(row: HTMLElement): RowLayout | null {
    const key = row.dataset.tabRow;
    const list = row.querySelector<HTMLElement>('.workspace-tab-list');
    if (!(list && isPaneSide(key))) {
        return null;
    }
    // A crowded row revealed a tab by scrolling (`tab-reveal.ts`); positions are as painted.
    const box = list.getBoundingClientRect().left + list.clientLeft;
    const origin = box - list.scrollLeft;
    const style = getComputedStyle(list);
    const padding = {
        left: Number.parseFloat(style.paddingLeft) || 0,
        right: Number.parseFloat(style.paddingRight) || 0,
    };
    const tabs = [...list.querySelectorAll<HTMLElement>('[data-tab-id]')].map((tab) => ({
        id: tab.dataset.tabId ?? '',
        left: origin + tab.offsetLeft,
        width: tab.offsetWidth,
    }));
    return {
        bounds: rectOf(row),
        gap: Number.parseFloat(style.columnGap) || 0,
        port: { left: box + padding.left, right: box + list.clientWidth - padding.right },
        row: key,
        start: origin + padding.left,
        tabs,
    };
}

function rectOf(element: Element): Rect {
    const { bottom, left, right, top } = element.getBoundingClientRect();
    return { bottom, left, right, top };
}

function isPaneSide(value: string | undefined): value is PaneSide {
    return value === 'primary' || value === 'secondary';
}
