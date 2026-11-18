import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    appHistorySteps,
    historyStepsFromKey,
    historyStepsKey,
    noHistorySteps,
    pathFromUrl,
} from './history-steps.ts';

/**
 * The web shell's Back and Forward. Both step the browser's own history, so
 * the band's chevrons, the browser's buttons, ⌘[ / ⌘], swipes, and the
 * mouse's side buttons all walk the same entries. Each is enabled while the
 * entry beside the current one is an App page (`appHistorySteps`).
 */
export function useWebHistory() {
    const navigate = useNavigate();
    const key = React.useSyncExternalStore(subscribe, readSteps, () =>
        historyStepsKey(noHistorySteps)
    );
    const steps = historyStepsFromKey(key);
    return {
        back: () => navigate(-1),
        canGoBack: steps.back,
        canGoForward: steps.forward,
        forward: () => navigate(1),
    };
}

/**
 * The Navigation API's same-origin entries (Chromium, Safari 26.2, Firefox
 * 147). Without it the browser exposes no neighbors, so React Router's own
 * entry index decides Back and Forward stays off.
 */
function readSteps(): string {
    const navigation = getNavigation();
    const current = navigation?.currentEntry;
    if (!(navigation && current)) {
        const index = (globalThis.history?.state as { idx?: number } | null)?.idx ?? 0;
        return historyStepsKey({ back: index > 0, forward: false });
    }
    const paths = navigation.entries().map((entry) => pathFromUrl(entry.url));
    return historyStepsKey(appHistorySteps(paths, current.index));
}

// The Navigation API, typed narrowly because the DOM lib does not ship it yet.
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
    if (navigation) {
        navigation.addEventListener('currententrychange', onChange);
        return () => navigation.removeEventListener('currententrychange', onChange);
    }
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
}
