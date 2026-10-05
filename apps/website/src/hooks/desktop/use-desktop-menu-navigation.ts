import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/**
 * Opens the current Server's surfaces when the native menu asks: Settings…
 * (⌘,) and Edit > Find… (⌘F). Desktop tabs pass `reveal`, which selects a tab
 * already on that page or navigates the focused pane's current tab (ADR 0039).
 */
export function useDesktopMenuNavigation(
    routes: { searchRoute: string; settingsRoute: string },
    reveal: (path: string) => void
) {
    useEffect(
        () => getDesktopBridge()?.onOpenSettings?.(() => reveal(routes.settingsRoute)),
        [reveal, routes.settingsRoute]
    );

    useEffect(
        () => getDesktopBridge()?.onOpenSearch?.(() => reveal(routes.searchRoute)),
        [reveal, routes.searchRoute]
    );
}

type HistoryDirection = 'back' | 'forward';

/** The desktop tabs' history handler while a Server's tabs are mounted. */
let tabHistory: ((direction: HistoryDirection) => void) | null = null;

/** Desktop tabs: the Go menu and swipes act on the focused pane's current tab. */
export function useDesktopTabHistory(handler: (direction: HistoryDirection) => void) {
    useEffect(() => {
        tabHistory = handler;
        return () => {
            if (tabHistory === handler) {
                tabHistory = null;
            }
        };
    }, [handler]);
}

/**
 * Go menu and macOS swipes. Inside a Server the desktop tabs own history
 * (`useDesktopTabHistory`); elsewhere (the Server picker) the window router does.
 */
export function useDesktopHistoryNavigation() {
    const navigate = useNavigate();

    useEffect(
        () =>
            getDesktopBridge()?.onHistoryNavigate?.((direction) => {
                if (tabHistory) {
                    tabHistory(direction);
                    return;
                }
                navigate(direction === 'back' ? -1 : 1);
            }),
        [navigate]
    );
}
