import { toast } from '@heroui/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { parseBrowserWorkspace } from '../../lib/desktop-browser.ts';

/**
 * Navigates the current server's surfaces when the native menu asks:
 * Settings… (⌘,) and Edit > Find… (⌘F). Mounted in ServerLayout because both
 * destinations are server-scoped routes; outside a server they no-op.
 */
export function useDesktopMenuNavigation(routes: { searchRoute: string; settingsRoute: string }) {
    const navigate = useNavigate();

    useEffect(
        () =>
            getDesktopBridge()?.onOpenSettings?.(() => {
                navigate(routes.settingsRoute);
            }),
        [navigate, routes.settingsRoute]
    );

    useEffect(
        () =>
            getDesktopBridge()?.onOpenSearch?.(() => {
                navigate(routes.searchRoute);
            }),
        [navigate, routes.searchRoute]
    );
}

/** Go menu and macOS swipes follow the selected workspace tab's history. */
export function useDesktopHistoryNavigation() {
    const navigate = useNavigate();

    useEffect(
        () =>
            getDesktopBridge()?.onHistoryNavigate?.((direction) => {
                const bridge = getDesktopBridge();
                const followHistory = async () => {
                    if (bridge?.browserSnapshot && bridge.browserCommand) {
                        const state = parseBrowserWorkspace(await bridge.browserSnapshot());
                        if (state?.activeId) {
                            await bridge.browserCommand({ kind: 'navigate', action: direction });
                            return;
                        }
                    }
                    navigate(direction === 'back' ? -1 : 1);
                };
                void followHistory().catch((error: Error) =>
                    toast.danger('Navigation failed', { description: error.message })
                );
            }),
        [navigate]
    );
}
