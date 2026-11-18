import * as React from 'react';
import type { DesktopTabsState } from './desktop-tabs-model.ts';
import type { DesktopTabsStore } from './desktop-tabs-store.ts';
import { browserTabStore, writeWindowTabs } from './desktop-tabs-window-store.ts';

/** Coalesces bursts (scroll memory saves page state per scroll pause) into one write. */
const writeDelayMs = 250;

/**
 * Saves one window's tabs for one Server to its session storage (ADR 0039),
 * at most once per `writeDelayMs`, and at once when the page hides or the
 * Server's tabs unmount, so a reload or Server switch never loses the last
 * change. Writes `latest()`, so saved page state persists without a render.
 */
export function useWindowTabsPersistence(serverId: string, store: DesktopTabsStore) {
    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        // Null so the first tabs (a seed, or claimed torn-off tabs) persist too.
        let written: DesktopTabsState | null = null;
        const flush = () => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            const next = store.latest();
            if (next !== written) {
                written = next;
                writeWindowTabs(browserTabStore(), serverId, next);
            }
        };
        const schedule = () => {
            timer ??= setTimeout(flush, writeDelayMs);
        };
        const unsubscribe = store.subscribeLatest(schedule);
        schedule();
        window.addEventListener('pagehide', flush);
        return () => {
            unsubscribe();
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [serverId, store]);
}
