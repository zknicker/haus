import * as React from 'react';

/**
 * Publishes each pane's rect, relative to the body `stage`, as CSS custom
 * properties on the stage (`--desktop-pane-<side>-x|y|w|h`); tab frames in
 * the layer above position themselves from them (shell.css). A
 * ResizeObserver writes them before paint, outside React, so a divider drag
 * moves every frame without re-rendering one.
 */
export function usePaneRects(stage: React.RefObject<HTMLElement | null>, split: boolean) {
    // biome-ignore lint/correctness/useExhaustiveDependencies: `split` adds or removes a pane element to observe.
    React.useLayoutEffect(() => {
        const root = stage.current;
        if (!root) {
            return;
        }
        const panes = [...root.querySelectorAll<HTMLElement>('.desktop-pane[data-pane]')];
        const write = () => {
            const origin = root.getBoundingClientRect();
            for (const pane of panes) {
                const side = pane.dataset.pane;
                const rect = pane.getBoundingClientRect();
                root.style.setProperty(`--desktop-pane-${side}-x`, `${rect.left - origin.left}px`);
                root.style.setProperty(`--desktop-pane-${side}-y`, `${rect.top - origin.top}px`);
                root.style.setProperty(`--desktop-pane-${side}-w`, `${rect.width}px`);
                root.style.setProperty(`--desktop-pane-${side}-h`, `${rect.height}px`);
            }
        };
        write();
        const observer = new ResizeObserver(write);
        observer.observe(root);
        for (const pane of panes) {
            observer.observe(pane);
        }
        return () => observer.disconnect();
    }, [stage, split]);
}
