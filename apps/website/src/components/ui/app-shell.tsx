'use client';

import type React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * AppShell — root container for the desktop window. The body fills the
 * full window height (sidebar + main both reach y=0); the topbar overlays
 * the top edge so any page-level background extends
 * all the way under the topbar buttons.
 */
export function AppShell({ className, ...props }: React.ComponentProps<'div'>): React.ReactElement {
    return (
        <div
            className={cn(
                'app-shell group/app-shell relative flex min-h-screen flex-col overflow-hidden bg-(--app-shell-ground) text-foreground md:h-dvh md:min-h-0 md:overscroll-none',
                className
            )}
            data-slot="app-shell"
            {...props}
        />
    );
}

/**
 * AppShellDragRegion — transparent native drag strip across the top of a
 * window with no window band (the activation frame). Its controls opt out on
 * themselves (shell.css), so empty chrome stays draggable.
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
