import * as React from 'react';
import {
    type BrowserPageSnapshot,
    useBrowserViewBounds,
} from '../../hooks/browser/use-browser-view-bounds.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { cn } from '../../lib/utils.ts';
import { BrowserFindBar } from './browser-find-bar.tsx';
import { BrowserWorkspaceToolbar } from './browser-workspace-toolbar.tsx';

/**
 * One web view's page at any pane width: its toolbar and find bar, then the host its native view
 * is placed over.
 */
export function BrowserPage({ className, tab }: { className?: string; tab: BrowserTab }) {
    const host = React.useRef<HTMLDivElement>(null);
    const snapshot = useBrowserViewBounds(host, tab.id, tab.error !== null);
    return (
        <section
            aria-label={`Browser: ${tab.title}`}
            className={cn('flex min-h-0 flex-col bg-background', className)}
        >
            <BrowserWorkspaceToolbar tab={tab} />
            <BrowserFindBar tab={tab} />
            <div
                className="relative min-h-0 flex-1 overflow-hidden"
                data-browser-view-host=""
                ref={host}
            >
                {snapshot ? <BrowserSnapshot snapshot={snapshot} /> : null}
                {tab.error ? (
                    <p className="p-6 text-muted text-sm" role="alert">
                        {tab.error}. Reload or open this page in your default browser.
                    </p>
                ) : null}
            </div>
        </section>
    );
}

/** Stands in for the native page while an overlay hides it; pinned top-left at capture size. */
function BrowserSnapshot({ snapshot }: { snapshot: BrowserPageSnapshot }) {
    return (
        <img
            alt=""
            className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
            draggable={false}
            height={snapshot.height}
            src={snapshot.src}
            style={{ width: snapshot.width, height: snapshot.height }}
            width={snapshot.width}
        />
    );
}
