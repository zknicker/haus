/**
 * Scrolls a crowded row just enough to show a selected tab at its resting
 * place. Not `scrollIntoView`: that reads the painted box, so a dropped tab
 * still settling from the pointer (`use-row-flip.ts`) scrolled the row toward
 * the pointer, shoving its neighbors aside until the settle shrank the row's
 * overflow and clamped them back.
 */
export function revealTab(tab: HTMLElement) {
    const list = tab.offsetParent;
    if (!(list instanceof HTMLElement)) {
        return;
    }
    const next = revealScrollLeft(
        { clientWidth: list.clientWidth, scrollLeft: list.scrollLeft },
        { left: tab.offsetLeft, width: tab.offsetWidth }
    );
    if (next !== null) {
        list.scrollLeft = next;
    }
}

/**
 * The row's scroll that shows a tab's resting box ("nearest"), or null when
 * it already shows. Offsets are layout positions, untouched by transforms.
 */
export function revealScrollLeft(
    port: { clientWidth: number; scrollLeft: number },
    tab: { left: number; width: number }
): number | null {
    const right = tab.left + tab.width;
    // A tab wider than the row shows its start.
    const target =
        tab.left < port.scrollLeft || tab.width > port.clientWidth
            ? tab.left
            : right > port.scrollLeft + port.clientWidth
              ? right - port.clientWidth
              : port.scrollLeft;
    return target === port.scrollLeft ? null : target;
}
