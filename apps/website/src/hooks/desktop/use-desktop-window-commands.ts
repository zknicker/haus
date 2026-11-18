import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/**
 * Desktop ⌘W/⌘T routing. The menu's Close and New Tab items ask the renderer
 * before acting: the window's desktop tabs (`useDesktopTabShortcuts`) register
 * here while a Server is open. Without them (the Server picker) Close closes
 * the window and New Tab does nothing.
 */
export interface DesktopTabPaneCommands {
    /** Close the focused pane's current tab; false = nothing to close. */
    closeActiveTab: () => boolean;
    /** Open a fresh tab in the focused pane; false = it cannot add one right now. */
    openNewTab: () => boolean;
}

let activePaneCommands: DesktopTabPaneCommands | null = null;

export function registerDesktopTabPane(commands: DesktopTabPaneCommands): () => void {
    activePaneCommands = commands;
    return () => {
        // A stale unregister (StrictMode, a remount) must not clear a newer registration.
        if (activePaneCommands === commands) {
            activePaneCommands = null;
        }
    };
}

export function handleCloseWindowRequest(closeWindow: () => void) {
    if (!activePaneCommands?.closeActiveTab()) {
        closeWindow();
    }
}

export function handleNewTabRequest() {
    activePaneCommands?.openNewTab();
}

/** Mounted once in AppFrame: subscribes the window to the File menu's requests. */
export function useDesktopWindowCommands() {
    React.useEffect(() => {
        const bridge = getDesktopBridge();
        if (!bridge) {
            return;
        }

        const unsubscribeClose = bridge.onCloseWindowRequest?.(() => {
            handleCloseWindowRequest(() => {
                void bridge.closeWindow();
            });
        });
        const unsubscribeNewTab = bridge.onNewTabRequest?.(() => {
            handleNewTabRequest();
        });

        return () => {
            unsubscribeClose?.();
            unsubscribeNewTab?.();
        };
    }, []);
}

/** Registered by the window's desktop tabs while `active`. */
export function useDesktopTabPane(commands: DesktopTabPaneCommands & { active: boolean }) {
    const latest = React.useRef(commands);
    React.useEffect(() => {
        latest.current = commands;
    });

    React.useEffect(() => {
        if (!commands.active) {
            return;
        }

        return registerDesktopTabPane({
            closeActiveTab: () => latest.current.closeActiveTab(),
            openNewTab: () => latest.current.openNewTab(),
        });
    }, [commands.active]);
}
