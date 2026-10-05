import * as React from 'react';
import type { DesktopTabsState } from './desktop-tabs-model.ts';
import { browserTabStore, writeWindowTabs } from './desktop-tabs-window-store.ts';

/** Coalesces bursts (scroll memory saves page state per frame) into one write. */
const writeDelayMs = 250;

/**
 * Saves one window's tabs for one Server to its session storage (ADR 0039),
 * at most once per `writeDelayMs`, and at once when the page hides or the
 * Server's tabs unmount, so a reload or Server switch never loses the last change.
 */
export function useWindowTabsPersistence(serverId: string, state: DesktopTabsState) {
    const pending = React.useRef<DesktopTabsState | null>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const flush = React.useCallback(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        const next = pending.current;
        pending.current = null;
        if (next) {
            writeWindowTabs(browserTabStore(), serverId, next);
        }
    }, [serverId]);

    React.useEffect(() => {
        pending.current = state;
        timer.current ??= setTimeout(flush, writeDelayMs);
    }, [flush, state]);
    React.useEffect(() => {
        window.addEventListener('pagehide', flush);
        return () => {
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [flush]);
}
