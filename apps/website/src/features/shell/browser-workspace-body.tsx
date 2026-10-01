import type * as React from 'react';
import { useBrowserWorkspace, useCoveringTabSelected } from './browser-workspace-context.tsx';
import { BrowserWorkspacePage } from './browser-workspace-page.tsx';
import { MainWorkspaceTabPage } from './workspace-tab-page.tsx';

export function BrowserWorkspaceBody({ children }: { children: React.ReactNode }) {
    const active = useCoveringTabSelected();
    const focusGroup = useBrowserWorkspace()?.focusGroup;
    return (
        // Pointer and focus inside the main column point Command-W at the main strip.
        <div
            className="relative flex min-h-0 min-w-0 flex-1"
            onFocusCapture={() => focusGroup?.('main')}
            onPointerDownCapture={() => focusGroup?.('main')}
        >
            {/* `isolate` keeps the chat's own z-indexed layers (composer, side pane)
                from stacking above the browser page, which is opaque while its
                native view hides behind an overlay. */}
            <div
                aria-hidden={active || undefined}
                className="isolate flex min-h-0 min-w-0 flex-1"
                inert={active}
            >
                {children}
            </div>
            <BrowserWorkspacePage />
            <MainWorkspaceTabPage />
        </div>
    );
}
