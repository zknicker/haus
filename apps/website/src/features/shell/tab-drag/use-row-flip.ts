import * as React from 'react';

/** Fluid Functionalism's "moderate" step: slides that follow a gesture. */
const slideMs = 180;
/** A dropped tab settles, and a tab entering a row eases its width, on the quicker step. */
const settleMs = 150;
const growMs = 150;
const flipId = 'tab-row-flip';
const fallbackEase = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Slides a row's tabs into their new places (FLIP) whenever its order or its
 * dragged tabs change: a neighbor the dragged tabs pass eases into the
 * vacated slot, dropped tabs settle from the pointer into their slots, and a
 * tab that appears grows in. Dragged tabs are painted at the pointer
 * (`tab-drag-engine.ts`), so they never slide while dragging; entering this
 * row from the other one, they only ease from their old width
 * (`arrivingWidth`) to this row's. When a drag starts, selected tabs that
 * were apart glide in beside the pressed one (Chrome's gather) instead of
 * jumping. Nothing moves under reduced motion.
 *
 * The "first" rects are read during render, before React touches the DOM,
 * and include any running slide, so an interrupted slide continues from where
 * it is.
 */
export function useRowFlip(
    list: React.RefObject<HTMLElement | null>,
    order: readonly string[],
    draggingIds: readonly string[],
    drag: {
        arrivingWidth: () => number | null;
        /** Paints the dragged tabs at the pointer, so they measure where they are drawn. */
        paint: () => void;
    }
) {
    const key = `${order.join('\n')}|${draggingIds.join('\n')}`;
    const last = React.useRef(key);
    const first = React.useRef<Map<string, DOMRect> | null>(null);
    const wasDragging = React.useRef<readonly string[]>([]);
    if (last.current !== key) {
        last.current = key;
        first.current = list.current ? visualRects(list.current) : null;
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the trigger; the rects ride a ref.
    React.useLayoutEffect(() => {
        const element = list.current;
        const before = first.current;
        const dragging = new Set(draggingIds);
        const dropped = new Set(wasDragging.current.filter((id) => !dragging.has(id)));
        const gathering = new Set(draggingIds.filter((id) => !wasDragging.current.includes(id)));
        first.current = null;
        wasDragging.current = draggingIds;
        if (element) {
            flipRow(element, before, { ...drag, dragging, dropped, gathering });
        }
    }, [key]);
}

function flipRow(
    element: HTMLElement,
    before: Map<string, DOMRect> | null,
    drag: {
        arrivingWidth: () => number | null;
        dragging: ReadonlySet<string>;
        dropped: ReadonlySet<string>;
        /** Tabs that started dragging in this row with this change. */
        gathering: ReadonlySet<string>;
        paint: () => void;
    }
) {
    const tabs = tabsOf(element);
    for (const tab of tabs) {
        // A tab no longer dragging drops its pointer offset before it is measured.
        if (!drag.dragging.has(tab.dataset.tabId ?? '') && tab.style.transform) {
            tab.style.transform = '';
        }
    }
    if (!before || prefersReducedMotion()) {
        return;
    }
    const easing = getComputedStyle(element).getPropertyValue('--ease-out').trim() || fallbackEase;
    const arriving = tabs.filter((tab) => {
        const id = tab.dataset.tabId ?? '';
        return drag.dragging.has(id) && !before.has(id);
    });
    for (const tab of arriving) {
        // Before the siblings measure, so they slide to where the eased width puts them.
        easeWidth(tab, drag.arrivingWidth(), easing);
    }
    gather(
        tabs.filter((tab) => drag.gathering.has(tab.dataset.tabId ?? '')),
        before,
        drag.paint,
        easing
    );
    for (const tab of tabs) {
        const id = tab.dataset.tabId ?? '';
        if (!drag.dragging.has(id)) {
            slide(tab, before.get(id) ?? null, easing, drag.dropped.has(id) ? settleMs : slideMs);
        }
    }
}

/** From its old rect into place, or grown in when it is new to the row. */
function slide(tab: HTMLElement, from: DOMRect | null, easing: string, duration: number) {
    cancelFlip(tab);
    if (!from) {
        tab.animate(
            [
                { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
                { clipPath: 'inset(0 0 0 0)', opacity: 1 },
            ],
            { duration: growMs, easing, id: flipId }
        );
        return;
    }
    const dx = from.left - tab.getBoundingClientRect().left;
    if (Math.abs(dx) >= 0.5) {
        tab.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], {
            duration,
            easing,
            id: flipId,
        });
    }
}

/**
 * A drag just started: the dragged tabs now sit side by side at the pointer.
 * The pressed tab was already under it; any selected tab that was apart
 * glides in from where it was, Chrome's initial-drag animation. It animates
 * `translate`, which composes with the pointer's `transform`, so the block
 * keeps following the pointer while the tab closes in.
 */
function gather(
    tabs: readonly HTMLElement[],
    before: Map<string, DOMRect>,
    paint: () => void,
    easing: string
) {
    if (tabs.length < 2) {
        return;
    }
    paint();
    const moved = tabs.flatMap((tab) => {
        const from = before.get(tab.dataset.tabId ?? '');
        return from ? [{ dx: from.left - tab.getBoundingClientRect().left, tab }] : [];
    });
    const offsets = gatherOffsets(moved.map((item) => item.dx));
    moved.forEach(({ tab }, index) => {
        cancelFlip(tab);
        const offset = offsets[index] ?? 0;
        if (Math.abs(offset) >= 0.5) {
            tab.animate([{ translate: `${offset}px 0` }, { translate: '0 0' }], {
                duration: slideMs,
                easing,
                id: flipId,
            });
        }
    });
}

/**
 * Where each gathering tab starts its glide, from how far each dragged tab
 * moved when the drag started. The pressed tab moved least (only the
 * activation travel, which the pointer owns), so every tab closes in relative
 * to it and the pressed tab itself does not move.
 */
export function gatherOffsets(moved: readonly number[]): number[] {
    const least = Math.min(...moved.map(Math.abs));
    const travel = moved.find((dx) => Math.abs(dx) === least) ?? 0;
    return moved.map((dx) => dx - travel);
}

/**
 * A dragged tab entering a row whose tabs are another width: its flex basis
 * eases from the width it had to the one it takes here. Only layout moves, so
 * the pointer's transform stays the engine's.
 */
function easeWidth(tab: HTMLElement, from: number | null, easing: string) {
    cancelFlip(tab);
    const to = tab.offsetWidth;
    if (from === null || Math.abs(from - to) < 0.5) {
        return;
    }
    const frame = (width: number) => ({
        flexBasis: `${width}px`,
        flexGrow: 0,
        flexShrink: 0,
        minWidth: 0,
    });
    tab.animate([frame(from), frame(to)], { duration: growMs, easing, id: flipId });
}

/** A tab still sliding into its slot, as a dropped tab settles from the pointer. */
export function isSettling(tab: HTMLElement): boolean {
    return tab
        .getAnimations()
        .some(
            (running) =>
                running.id === flipId &&
                running.playState === 'running' &&
                running.effect instanceof KeyframeEffect &&
                running.effect.getKeyframes().some((frame) => 'transform' in frame)
        );
}

function cancelFlip(tab: HTMLElement) {
    for (const running of tab.getAnimations()) {
        if (running.id === flipId) {
            running.cancel();
        }
    }
}

function tabsOf(list: HTMLElement): HTMLElement[] {
    return [...list.querySelectorAll<HTMLElement>(':scope > [data-tab-id]')];
}

function visualRects(list: HTMLElement): Map<string, DOMRect> {
    return new Map(
        tabsOf(list).map((tab) => [tab.dataset.tabId ?? '', tab.getBoundingClientRect()])
    );
}

function prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
