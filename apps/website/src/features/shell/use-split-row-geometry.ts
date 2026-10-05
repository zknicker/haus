import * as React from 'react';
import { useDesktopPaneDivider } from './desktop-pane-drag.ts';

/**
 * Sizes the band's left tab row from the panes' measured geometry so the
 * right row — and its leading hairline — starts exactly on the pane divider's
 * 1px line (HeroUI's Resizable handle paints its own box; the hit area is a
 * transparent `::before`). Writes `--desktop-pane-primary-row` on the band in
 * px: the divider's left edge minus the left row's left edge minus the row
 * gap. Re-measures whenever the band, the pane group, or either panel resizes,
 * which covers divider drags, window and sidebar resizes, and pane changes.
 */
export function useSplitRowGeometry(band: React.RefObject<HTMLElement | null>, split: boolean) {
    const divider = useDesktopPaneDivider();
    React.useLayoutEffect(() => {
        const header = band.current;
        const group = divider?.parentElement;
        if (!(split && header && divider && group)) {
            return;
        }
        const measure = () => {
            const row = header.querySelector<HTMLElement>(
                ':scope > .workspace-tabs[data-pane="primary"]'
            );
            if (!row) {
                return;
            }
            const gap = Number.parseFloat(getComputedStyle(header).columnGap) || 0;
            const width =
                divider.getBoundingClientRect().left - row.getBoundingClientRect().left - gap;
            header.style.setProperty('--desktop-pane-primary-row', `${Math.max(0, width)}px`);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(header);
        observer.observe(group);
        for (const child of group.children) {
            observer.observe(child);
        }
        measure();
        return () => {
            observer.disconnect();
            header.style.removeProperty('--desktop-pane-primary-row');
        };
    }, [band, divider, split]);
}
