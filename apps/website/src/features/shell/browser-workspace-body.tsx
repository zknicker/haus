import type * as React from 'react';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { BrowserWorkspacePage } from './browser-workspace-page.tsx';

export function BrowserWorkspaceBody({ children }: { children: React.ReactNode }) {
    const active = useBrowserWorkspace()?.state.activeId != null;
    return (
        <div className="relative flex min-h-0 flex-1">
            <div
                aria-hidden={active || undefined}
                className="flex min-h-0 min-w-0 flex-1"
                inert={active}
            >
                {children}
            </div>
            <BrowserWorkspacePage />
        </div>
    );
}
