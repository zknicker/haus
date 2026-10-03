import type * as React from 'react';
import { useBrowserWorkspace, useCoveringTabSelected } from './browser-workspace-context.tsx';
import { ClosableTabPage } from './workspace-tab-page.tsx';

/** The routed page's column; in expanded mode the selected closable tab covers it. */
export function BrowserWorkspaceBody({ children }: { children: React.ReactNode }) {
    const covering = useCoveringTabSelected();
    const workspace = useBrowserWorkspace();
    const shown = covering ? workspace?.shownClosable : null;
    return (
        <div className="relative flex min-h-0 min-w-0 flex-1">
            {/* `isolate` keeps the chat's own z-indexed layers (composer, side pane)
                from stacking above the browser page, which is opaque while its
                native view hides behind an overlay. */}
            <div
                aria-hidden={covering || undefined}
                className="isolate flex min-h-0 min-w-0 flex-1"
                inert={covering}
            >
                {children}
            </div>
            {shown ? <ClosableTabPage className="absolute inset-0 z-10" tabRef={shown} /> : null}
        </div>
    );
}
