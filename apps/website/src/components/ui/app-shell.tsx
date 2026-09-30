'use client';

import type React from 'react';
import { cn } from '../../lib/utils.ts';
import { canStartWindowDrag, startCurrentWindowDrag } from '../../lib/window-drag.ts';

/**
 * AppShell — root container for the desktop window. The body fills the
 * full window height (sidebar + main both reach y=0); the topbar overlays
 * the top edge so any page-level background extends
 * all the way under the topbar buttons.
 */
export function AppShell({
    className,
    onMouseDown,
    ...props
}: React.ComponentProps<'div'>): React.ReactElement {
    const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
        onMouseDown?.(event);

        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.clientY > dragRegionBottom(event.currentTarget)
        ) {
            return;
        }

        const target = event.target instanceof Element ? event.target : event.currentTarget;

        if (!canStartWindowDrag(target)) {
            return;
        }

        void startCurrentWindowDrag().catch((error: unknown) => {
            console.error('Failed to start window dragging.', error);
        });
    };

    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: native window-drag plumbing, not an interactive control
        // biome-ignore lint/a11y/noStaticElementInteractions: native window-drag plumbing, not an interactive control
        <div
            className={cn(
                'app-shell group/app-shell relative flex min-h-screen flex-col overflow-hidden bg-(--app-shell-ground) text-foreground md:h-dvh md:min-h-0 md:overscroll-none',
                className
            )}
            data-slot="app-shell"
            onMouseDown={handleMouseDown}
            {...props}
        />
    );
}

/**
 * AppShellDragRegion — transparent native drag strip across the top chrome.
 * Top-edge controls opt out with no-drag while empty chrome stays draggable
 * across every page.
 */
export function AppShellDragRegion({
    className,
    ...props
}: React.ComponentProps<'div'>): React.ReactElement {
    return (
        <div
            aria-hidden="true"
            className={cn(
                'app-shell-drag-region pointer-events-none absolute top-0 left-0 z-30 h-(--app-shell-drag-height) w-full cursor-default select-none',
                className
            )}
            data-slot="app-shell-drag-region"
            data-window-drag-region=""
            {...props}
        />
    );
}

/** The drag strip's bottom edge; its height is a theme token that follows the shell variant. */
function dragRegionBottom(shell: HTMLElement) {
    const strip = shell.querySelector('[data-slot="app-shell-drag-region"]');
    return strip ? strip.getBoundingClientRect().bottom : 0;
}
