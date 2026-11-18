import { toast } from '@heroui/react';
import * as React from 'react';
import { browserViewLayout } from '../../hooks/browser/browser-view-layout.ts';
import { createViewSweeper, unnamedViewGraceMs } from '../../hooks/browser/browser-view-sweep.ts';
import { focusedViewId, referencedViewIds } from '../../hooks/browser/browser-view-tabs.ts';
import {
    type BrowserViews,
    BrowserViewsContext,
} from '../../hooks/browser/browser-views-context.ts';
import { browserWorkspaceLifecycle } from '../../hooks/browser/browser-workspace-lifecycle.ts';
import { useBrowserFind } from '../../hooks/browser/use-browser-find.ts';
import { useBrowserHistory } from '../../hooks/browser/use-browser-history.ts';
import { useBrowserShortcuts } from '../../hooks/browser/use-browser-shortcuts.ts';
import { useBrowserViewRequests } from '../../hooks/browser/use-browser-view-requests.ts';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type BrowserCommand,
    type BrowserTab,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';

const noViews: BrowserTab[] = [];

/**
 * The window's web views for one Server (ADR 0039), inside the desktop tabs
 * provider. Mirrors Electron's view state, mounts and resets the Electron
 * workspace with the Server, turns web links and view focus into tab actions,
 * runs page shortcuts and find on the focused pane's web page, and destroys
 * views no open tab's history names once they stay unnamed for a short grace
 * (`browser-view-sweep.ts`).
 */
export function BrowserViewsProvider({
    children,
    serverId,
}: {
    children: React.ReactNode;
    serverId: string;
}) {
    const tabs = useDesktopTabs();
    const [views, setViews] = React.useState(noViews);
    const [ready, setReady] = React.useState(false);
    const bridge = getDesktopBridge();
    const command = React.useCallback(
        (input: BrowserCommand) => {
            void bridge?.browserCommand?.(input).catch((error: Error) => {
                toast.danger('Browser action failed', { description: error.message });
            });
        },
        [bridge]
    );
    const viewsById = React.useMemo(() => new Map(views.map((view) => [view.id, view])), [views]);
    const history = useBrowserHistory(views);
    const focusedId = focusedViewId(tabs.state);
    const focusedView = focusedId ? (viewsById.get(focusedId) ?? null) : null;
    const find = useBrowserFind(focusedView?.id ?? null, command);
    useBrowserShortcuts({ browserTab: focusedView, command, find });
    useBrowserViewRequests(tabs);
    React.useEffect(() => {
        if (!(bridge?.browserSnapshot && bridge.onBrowserState)) {
            return;
        }
        let mounted = true;
        let receivedEvent = false;
        const accept = (value: unknown) => {
            const parsed = parseBrowserWorkspace(value);
            if (mounted && parsed) {
                setViews(parsed.tabs);
            }
        };
        const unsubscribe = bridge.onBrowserState((value) => {
            receivedEvent = true;
            accept(value);
        });
        browserWorkspaceLifecycle.mount(serverId, () => {
            void bridge.browserCommand?.({ kind: 'mount' }).then(
                () => mounted && setReady(true),
                (error: Error) =>
                    toast.danger('Browser unavailable', { description: error.message })
            );
        });
        void bridge
            .browserSnapshot()
            .then((value) => {
                if (!receivedEvent) {
                    accept(value);
                }
            })
            .catch((error: Error) =>
                toast.danger('Browser unavailable', { description: error.message })
            );
        return () => {
            mounted = false;
            setReady(false);
            unsubscribe();
            browserWorkspaceLifecycle.unmount(serverId, () => command({ kind: 'reset' }));
        };
    }, [bridge, command, serverId]);
    // Closed tabs and trimmed history entries let go of their views; reopening restores by URL.
    const [sweeper] = React.useState(createViewSweeper);
    React.useEffect(() => {
        const named = referencedViewIds(tabs.state);
        const ids = views.map((view) => view.id);
        const sweep = () => {
            for (const id of sweeper.sweep(ids, named, Date.now())) {
                command({ kind: 'close', id });
            }
        };
        sweep();
        const timer = setTimeout(sweep, unnamedViewGraceMs);
        return () => clearTimeout(timer);
    }, [command, sweeper, tabs.state, views]);
    React.useEffect(() => {
        void browserViewLayout.focus(focusedId);
    }, [focusedId]);
    const value = React.useMemo<BrowserViews>(
        () => ({ command, find, history, ready, views: viewsById }),
        [command, find, history, ready, viewsById]
    );
    return <BrowserViewsContext value={value}>{children}</BrowserViewsContext>;
}
