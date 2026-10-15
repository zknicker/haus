import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    useOptionalDesktopTabs,
    useOptionalDesktopTabsSelector,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { useTabId } from '../../hooks/desktop-tabs/tab-presence.ts';
import { serverRoute } from '../servers/server-routes.ts';
import {
    type LibraryHistorySteps,
    libraryHistorySteps,
    noLibraryHistory,
    routerPathFromUrl,
} from './library-history.ts';

/**
 * The Files view's Back and Forward. Both step the router's own history, so
 * the buttons, ⌘[ / ⌘], swipes, and the mouse's side buttons all walk the
 * same entries: a desktop tab's history inside a tab, the browser's on the
 * web. Each is enabled only while the entry beside the current one is the
 * library (`libraryHistorySteps`).
 */
export function useLibraryHistory(slug: string) {
    const navigate = useNavigate();
    const libraryPath = `${serverRoute(slug)}/artifacts`;
    const tabSteps = useTabLibraryHistory(libraryPath);
    const webSteps = useWebLibraryHistory(libraryPath, tabSteps === null);
    const steps = tabSteps ?? webSteps;
    return {
        back: () => navigate(-1),
        canGoBack: steps.back,
        canGoForward: steps.forward,
        forward: () => navigate(1),
    };
}

/** Inside a desktop tab: its history entries; null on the web. */
function useTabLibraryHistory(libraryPath: string): LibraryHistorySteps | null {
    const tabId = useTabId();
    const key = useOptionalDesktopTabsSelector(useOptionalDesktopTabs(), (state) => {
        const tab = tabId ? state.tabs[tabId] : undefined;
        if (!tab) {
            return null;
        }
        const paths = tab.history.entries.map((entry) =>
            entry.location.kind === 'app' ? entry.location.path : null
        );
        return stepsKey(libraryHistorySteps(paths, tab.history.index, libraryPath));
    });
    return key === null ? null : stepsFromKey(key);
}

/**
 * On the web: the Navigation API's same-origin entries (Chromium, Safari 26.2,
 * Firefox 147). Without it the browser exposes no neighbors, so both stay off.
 */
function useWebLibraryHistory(libraryPath: string, enabled: boolean): LibraryHistorySteps {
    const read = React.useCallback(() => {
        const navigation = enabled ? getNavigation() : undefined;
        const current = navigation?.currentEntry;
        if (!(navigation && current)) {
            return stepsKey(noLibraryHistory);
        }
        const paths = navigation.entries().map((entry) => routerPathFromUrl(entry.url));
        return stepsKey(libraryHistorySteps(paths, current.index, libraryPath));
    }, [enabled, libraryPath]);
    const key = React.useSyncExternalStore(subscribe, read, () => stepsKey(noLibraryHistory));
    return stepsFromKey(key);
}

// Chromium's Navigation API, typed narrowly because the DOM lib does not ship it yet.
interface NavigationHistoryEntryLike {
    index: number;
    url: string | null;
}

interface NavigationLike extends EventTarget {
    currentEntry: NavigationHistoryEntryLike | null;
    entries(): NavigationHistoryEntryLike[];
}

function getNavigation(): NavigationLike | undefined {
    return (globalThis as { navigation?: NavigationLike }).navigation;
}

function subscribe(onChange: () => void) {
    const navigation = getNavigation();
    navigation?.addEventListener('currententrychange', onChange);
    return () => navigation?.removeEventListener('currententrychange', onChange);
}

// useSyncExternalStore snapshots must be stable, so the pair travels as a string.
function stepsKey(steps: LibraryHistorySteps): string {
    return `${steps.back ? 1 : 0}${steps.forward ? 1 : 0}`;
}

function stepsFromKey(key: string): LibraryHistorySteps {
    return { back: key[0] === '1', forward: key[1] === '1' };
}
