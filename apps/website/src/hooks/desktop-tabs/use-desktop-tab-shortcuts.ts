import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    appShortcut,
    type BrowserShortcut,
    isMacPlatform,
    parseBrowserShortcut,
} from '../browser/browser-shortcut-keys.ts';
import { useDesktopTabPane } from '../desktop/use-desktop-window-commands.ts';
import type { DesktopTabsApi } from './desktop-tabs-context.ts';
import { newTabLocation } from './desktop-tabs-model.ts';

/**
 * Tab shortcuts, all acting on the focused pane (ADR 0039). ⌘T (the new tab
 * page) and ⌘W arrive as File menu requests; ⌘⇧T, ⌘1–9, and Control-Tab
 * arrive as the renderer's own keydowns or as shortcuts Electron forwards from
 * the menu or a focused web page. ⌘⇧W closes the window in Electron. Page shortcuts (reload, find,
 * address) stay with `useBrowserShortcuts`.
 */
export function useDesktopTabShortcuts(tabs: DesktopTabsApi) {
    const latest = React.useRef(tabs);
    latest.current = tabs;

    useDesktopTabPane({
        active: true,
        closeActiveTab: () => {
            latest.current.close();
            return true;
        },
        openNewTab: () => {
            openNewTabPage(latest.current);
            return true;
        },
    });

    React.useEffect(() => {
        const bridge = getDesktopBridge();
        if (!bridge) {
            return;
        }
        const isMac = isMacPlatform();
        const onKeyDown = (event: KeyboardEvent) => {
            const shortcut = appShortcut(event, isMac);
            if (!shortcut || event.defaultPrevented || isInDialog(event.target)) {
                return;
            }
            if (runTabShortcut(shortcut, latest.current)) {
                event.preventDefault();
            }
        };
        const unsubscribe = bridge.onBrowserShortcut?.((value) => {
            const shortcut = parseBrowserShortcut(value);
            if (shortcut) {
                runTabShortcut(shortcut, latest.current);
            }
        });
        window.addEventListener('keydown', onKeyDown);
        return () => {
            unsubscribe?.();
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);
}

/** ⌘T and the row's plus: the new tab page, appended at the end of the focused pane's row. */
export function openNewTabPage(tabs: Pick<DesktopTabsApi, 'openInFocusedPane'>) {
    tabs.openInFocusedPane(newTabLocation, 'newTabAtEnd');
}

/** Runs `shortcut` if it is a tab shortcut; false leaves it to page shortcuts. */
export function runTabShortcut(
    shortcut: BrowserShortcut,
    tabs: Pick<DesktopTabsApi, 'reopenClosed' | 'selectInFocusedPane' | 'state'>
): boolean {
    switch (shortcut) {
        case 'reopen-tab':
            tabs.reopenClosed();
            return true;
        case 'next-tab':
        case 'previous-tab':
            tabs.selectInFocusedPane({ step: shortcut === 'next-tab' ? 1 : -1 });
            return true;
        default: {
            const number = shortcut.startsWith('tab-') ? Number(shortcut.slice(4)) : 0;
            if (number < 1) {
                return false;
            }
            // ⌘9 is always the row's last tab.
            tabs.selectInFocusedPane({
                index: number === 9 ? rowLength(tabs.state) - 1 : number - 1,
            });
            return true;
        }
    }
}

function rowLength(state: DesktopTabsApi['state']) {
    return state[state.focusedPane]?.tabIds.length ?? 0;
}

/** Keys pressed inside a dialog (modal focus is trapped there) belong to the dialog. */
function isInDialog(target: EventTarget | null) {
    return (
        target instanceof Element &&
        target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null
    );
}
