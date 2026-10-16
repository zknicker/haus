import { parseBrowserWorkspace } from '../../lib/desktop-browser.ts';
import type { DesktopTabCommands } from '../desktop-tabs/desktop-tabs-context.ts';
import { currentLocation, type DesktopTabsState } from '../desktop-tabs/desktop-tabs-model.ts';

/** The Electron side the flow watches: every web view's live address. */
export interface ProviderTabBridge {
    onBrowserState: (listener: (value: unknown) => void) => () => void;
}

/**
 * Opens a provider page (Linear's OAuth, say) as a web tab beside `fromTabId`
 * and watches it until it lands back on the App (`returns` answers the
 * in-App path, or null). Then the web tab closes and its opener tab shows that
 * page, outcome query included; with the opener gone, the web tab itself
 * turns into that page. Closing the web tab, or moving it to another window,
 * ends the watch with nothing to hand back. Returns a function that stops
 * watching.
 */
export function openDesktopProviderTab(input: {
    bridge: ProviderTabBridge;
    fromTabId: string | null;
    returns: (url: string) => string | null;
    tabs: Pick<DesktopTabCommands, 'close' | 'navigate' | 'open' | 'select' | 'store' | 'tab'>;
    title: string;
    url: string;
    viewId?: string;
}): () => void {
    const { bridge, fromTabId, returns, tabs } = input;
    const viewId = input.viewId ?? crypto.randomUUID();
    let stopped = false;
    const stop = () => {
        stopped = true;
        unwatchBrowser();
        unwatchTabs();
    };
    const handBack = (path: string) => {
        const webTabId = tabShowingView(tabs.store.latest(), viewId);
        stop();
        if (!webTabId) {
            return;
        }
        const location = { kind: 'app', path } as const;
        if (fromTabId && tabs.tab(fromTabId)) {
            tabs.close([webTabId]);
            tabs.navigate(fromTabId, location, 'push');
            tabs.select(fromTabId);
        } else {
            tabs.navigate(webTabId, location, 'replace');
        }
    };
    const unwatchBrowser = bridge.onBrowserState((value) => {
        const url = viewUrl(value, viewId);
        const path = url && !stopped ? returns(url) : null;
        if (path) {
            handBack(path);
        }
    });
    const unwatchTabs = tabs.store.subscribe(() => {
        if (!tabShowingView(tabs.store.latest(), viewId)) {
            stop();
        }
    });
    tabs.open(fromTabId, { kind: 'browser', title: input.title, url: input.url, viewId });
    return stop;
}

/** The tab whose current page is `viewId`'s web view. */
function tabShowingView(state: DesktopTabsState, viewId: string): string | null {
    for (const [tabId, tab] of Object.entries(state.tabs)) {
        const location = currentLocation(tab);
        if (location?.kind === 'browser' && location.viewId === viewId) {
            return tabId;
        }
    }
    return null;
}

/** `viewId`'s committed address in an Electron browser state publish. */
function viewUrl(value: unknown, viewId: string): string | null {
    return parseBrowserWorkspace(value)?.tabs.find((view) => view.id === viewId)?.url ?? null;
}
