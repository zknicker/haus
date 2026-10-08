import * as React from 'react';
import type { BrowserTabLocation } from '../../hooks/browser/browser-view-tabs.ts';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import { useDesktopTabCommands } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { BrowserPage } from './browser-page.tsx';

/**
 * A desktop tab showing a web page (ADR 0039). Its view is named by the tab's
 * history entry: mounting opens it (or, after a close, eviction, or relaunch,
 * restores it by URL), and the page's settled address and title are written
 * back to the entry so a later restore lands where the person left off.
 * Render it keyed by `location.viewId`, not the history entry key: the
 * write-back replaces the entry, and a remount would flash the native view.
 */
export function BrowserTabPage({
    className,
    location,
    tabId,
}: {
    className?: string;
    location: BrowserTabLocation;
    tabId: string;
}) {
    const browser = useBrowserViews();
    const view = browser?.views.get(location.viewId) ?? null;
    useOpenBrowserView(location, view !== null);
    useSyncBrowserLocation(tabId, location, view);
    const tab = React.useMemo(() => view ?? pendingView(location), [location, view]);
    return <BrowserPage className={className} key={location.viewId} tab={tab} />;
}

/** Opens the named view once the workspace is mounted; Electron ignores a view it already has. */
function useOpenBrowserView(location: BrowserTabLocation, exists: boolean) {
    const browser = useBrowserViews();
    const command = browser?.command;
    const ready = browser?.ready === true;
    const { url, viewId } = location;
    React.useEffect(() => {
        if (!(command && ready) || exists) {
            return;
        }
        command({ kind: 'open', url, viewId });
    }, [command, exists, ready, url, viewId]);
}

/** Writes a settled page's address and title back to the tab's current entry. */
function useSyncBrowserLocation(
    tabId: string,
    location: BrowserTabLocation,
    view: BrowserTab | null
) {
    const { navigate } = useDesktopTabCommands();
    const settled = view && !view.loading && !view.error ? view : null;
    const url = settled?.url;
    const title = settled?.title;
    React.useEffect(() => {
        if (
            url === undefined ||
            title === undefined ||
            (url === location.url && title === location.title)
        ) {
            return;
        }
        navigate(tabId, { ...location, title, url }, 'replace');
    }, [location, navigate, tabId, title, url]);
}

/** What the page shows before Electron reports the view: the entry's address, loading. */
function pendingView(location: BrowserTabLocation): BrowserTab {
    return {
        canGoBack: false,
        canGoForward: false,
        error: null,
        faviconUrl: null,
        find: null,
        id: location.viewId,
        loading: true,
        title: location.title,
        url: location.url,
        zoomFactor: 1,
    };
}
