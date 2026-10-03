import { toast } from '@heroui/react';
import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/**
 * Desktop ⌘W/⌘T routing. The menu's Close and New Tab items ask the renderer
 * before acting: the visible tabbed pane (the desktop workspace tabs)
 * registers commands here, and Close only falls back to closing the window
 * when the pane has no tab to close.
 */
export interface DesktopTabPaneCommands {
    /** Close the pane's active tab (or the pane itself); false = nothing to close. */
    closeActiveTab: () => boolean;
    /** Open a fresh tab in the pane; false = the pane cannot add one right now. */
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
    if (!activePaneCommands?.openNewTab()) {
        void getDesktopBridge()
            ?.browserCommand?.({ kind: 'new' })
            .catch((error: Error) =>
                toast.danger('Could not open a tab', { description: error.message })
            );
    }
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

/** Registered by the tabbed pane while it is visible. */
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
