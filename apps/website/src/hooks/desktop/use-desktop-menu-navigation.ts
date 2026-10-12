import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/**
 * Opens the current Server's surfaces when the native menu asks: Settings…
 * (⌘,, the window's one Settings tab) and Edit > Find… (⌘F, the Search page
 * opened on the right), ADR 0039. Pass stable callbacks.
 */
export function useDesktopMenuNavigation(menu: {
    openSearch: () => void;
    openSettings: () => void;
}) {
    useEffect(() => getDesktopBridge()?.onOpenSettings?.(menu.openSettings), [menu.openSettings]);

    useEffect(() => getDesktopBridge()?.onOpenSearch?.(menu.openSearch), [menu.openSearch]);
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
 * Go menu, macOS swipes, and the mouse's back and forward buttons. Inside a
 * Server the desktop tabs own history (`useDesktopTabHistory`); elsewhere (the
 * Server picker) the window router does.
 */
export function useDesktopHistoryNavigation() {
    const navigate = useNavigate();

    useEffect(() => {
        const bridge = getDesktopBridge();
        if (!bridge) {
            return;
        }
        const follow = (direction: HistoryDirection) => {
            if (tabHistory) {
                tabHistory(direction);
                return;
            }
            navigate(direction === 'back' ? -1 : 1);
        };
        // Chromium hands buttons 4 and 5 to the page but, unlike Chrome, Electron
        // never turns them into navigation, and macOS sends no app-command.
        const onMouseUp = (event: MouseEvent) => {
            const direction = mouseHistoryDirection(event.button);
            if (direction) {
                event.preventDefault();
                follow(direction);
            }
        };
        window.addEventListener('mouseup', onMouseUp);
        const unsubscribe = bridge.onHistoryNavigate?.(follow);
        return () => {
            window.removeEventListener('mouseup', onMouseUp);
            unsubscribe?.();
        };
    }, [navigate]);
}

/** DOM `MouseEvent.button`: 3 is the back button, 4 forward. */
export function mouseHistoryDirection(button: number): HistoryDirection | null {
    if (button === 3) {
        return 'back';
    }
    return button === 4 ? 'forward' : null;
}
