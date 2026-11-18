import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { parseBrowserShortcut } from '../../hooks/browser/browser-shortcut-keys.ts';
import type { DesktopTabsApi } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import {
    currentLocation,
    type DesktopTabsState,
} from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { focusedTabId } from '../../hooks/desktop-tabs/desktop-tabs-panes.ts';
import { focusedSelection } from '../../hooks/desktop-tabs/desktop-tabs-selection.ts';
import { canMoveToNewWindow } from '../../hooks/desktop-tabs/move-tabs-to-new-window.ts';
import { type DesktopMenuState, getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { tabPaneMove } from './workspace-tab-move.ts';

type MenuCommand = 'duplicate-tab' | 'move-tab-to-new-window' | 'move-tab-to-other-pane' | 'reload';

/**
 * The App menu bar's Tab menu and View > Reload Page for this window (ADR
 * 0039). Reports which Tab items apply to the focused pane's tabs, so Electron
 * enables them, and runs the commands it forwards on them. Select Next and
 * Previous Tab ride the tab shortcuts; a web page's reload never reaches here
 * (Electron reloads the focused web page itself).
 */
export function useTabMenuBar(tabs: DesktopTabsApi) {
    const queryClient = useQueryClient();
    const latest = React.useRef(tabs);
    latest.current = tabs;
    const report = JSON.stringify(tabMenuState(tabs.state));

    React.useEffect(() => {
        void getDesktopBridge()?.reportMenuState?.({ tabs: JSON.parse(report) });
    }, [report]);

    React.useEffect(
        () =>
            getDesktopBridge()?.onBrowserShortcut?.((value) => {
                const command = parseBrowserShortcut(value);
                if (command && isMenuCommand(command)) {
                    runMenuCommand(command, latest.current, () => {
                        void queryClient.invalidateQueries();
                    });
                }
            }),
        [queryClient]
    );
}

/** Which Tab menu items apply to the focused pane's current tab or selection. */
export function tabMenuState(state: DesktopTabsState): NonNullable<DesktopMenuState['tabs']> {
    const targets = focusedSelection(state);
    return {
        duplicate: targets.length > 0,
        moveToNewWindow: canMoveToNewWindow(state, targets),
        moveToOtherPane: targets.length > 0 && tabPaneMove(state, targets) !== null,
        selectOther: (state[state.focusedPane]?.tabIds.length ?? 0) > 1,
    };
}

/**
 * Runs a forwarded menu command on the focused pane's tabs. Reload Page on an
 * App page refetches the window's live queries (`refetch`): the page's data
 * reloads in place, keeping its scroll, draft, and history; the App window
 * itself never reloads.
 */
export function runMenuCommand(
    command: MenuCommand,
    tabs: Pick<DesktopTabsApi, 'duplicate' | 'move' | 'moveToNewWindow' | 'state'>,
    refetch: () => void
) {
    const targets = focusedSelection(tabs.state);
    switch (command) {
        case 'duplicate-tab':
            tabs.duplicate(targets);
            return;
        case 'move-tab-to-new-window':
            tabs.moveToNewWindow(targets);
            return;
        case 'move-tab-to-other-pane': {
            const move = tabPaneMove(tabs.state, targets);
            if (move) {
                tabs.move(targets, move.to);
            }
            return;
        }
        case 'reload': {
            const tabId = focusedTabId(tabs.state);
            const tab = tabId ? tabs.state.tabs[tabId] : undefined;
            if (tab && currentLocation(tab).kind === 'app') {
                refetch();
            }
            return;
        }
    }
}

function isMenuCommand(value: string): value is MenuCommand {
    return ['duplicate-tab', 'move-tab-to-new-window', 'move-tab-to-other-pane', 'reload'].includes(
        value
    );
}
