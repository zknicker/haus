import type * as React from 'react';
import { ArtifactWorkspacePage } from './artifact-workspace-page.tsx';
import { useCoveringTabSelected } from './browser-workspace-context.tsx';
import { BrowserWorkspacePage } from './browser-workspace-page.tsx';

export function BrowserWorkspaceBody({ children }: { children: React.ReactNode }) {
    const active = useCoveringTabSelected();
    return (
        <div className="relative flex min-h-0 flex-1">
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
            <ArtifactWorkspacePage />
        </div>
    );
}
