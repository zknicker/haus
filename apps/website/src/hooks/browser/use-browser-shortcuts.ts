import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserCommand, BrowserTab } from '../../lib/desktop-browser.ts';
import { numberedTab, relativeTab } from '../workspace-tabs/strip-navigation.ts';
import type { WorkspaceTabs } from '../workspace-tabs/use-workspace-tabs.ts';
import type { WorkspaceTabRef } from '../workspace-tabs/workspace-tabs-model.ts';
import {
    appShortcut,
    type BrowserShortcut,
    parseBrowserShortcut,
} from './browser-shortcut-keys.ts';
import type { BrowserFind } from './use-browser-find.ts';

type ShortcutTabs = Pick<
    WorkspaceTabs,
    'reopenClosedTab' | 'selectTab' | 'selectedTab' | 'stripTabs'
>;

interface ShortcutTarget {
    /** The shown browser tab, if a browser page is on screen. */
    browserTab: BrowserTab | null;
    command: (input: BrowserCommand) => void;
    find: BrowserFind;
    tabs: ShortcutTabs;
}

/** Shortcuts that only mean something while a browser tab is selected. */
const pageShortcuts = new Set<BrowserShortcut>([
    'address',
    'find',
    'find-next',
    'find-previous',
    'hard-reload',
    'reload',
    'stop',
]);

/**
 * Runs workspace tab and page shortcuts from both focus paths: the App's own
 * keydown events, and shortcuts the main process forwards from the App menu or
 * a focused native page (electron/browser-shortcuts.cjs).
 */
export function useBrowserShortcuts(target: ShortcutTarget) {
    const latest = React.useRef(target);
    latest.current = target;
    React.useEffect(() => {
        const bridge = getDesktopBridge();
        if (!bridge?.browserCommand) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            const shortcut = appShortcut(event);
            if (!shortcut || event.defaultPrevented || !applies(shortcut, latest.current)) {
                return;
            }
            // Esc stays with fields and overlays; it stops a load only from the page chrome.
            if (shortcut === 'stop' && isEditable(event.target)) {
                return;
            }
            event.preventDefault();
            runBrowserShortcut(shortcut, latest.current);
        };
        const unsubscribe = bridge.onBrowserShortcut?.((value) => {
            const shortcut = parseBrowserShortcut(value);
            if (shortcut && applies(shortcut, latest.current)) {
                runBrowserShortcut(shortcut, latest.current);
            }
        });
        window.addEventListener('keydown', onKeyDown);
        return () => {
            unsubscribe?.();
            window.removeEventListener('keydown', onKeyDown);
        };
    }, []);
}

function applies(shortcut: BrowserShortcut, { browserTab }: ShortcutTarget) {
    if (shortcut === 'stop') {
        return browserTab?.loading === true;
    }
    return browserTab !== null || !pageShortcuts.has(shortcut);
}

function runBrowserShortcut(shortcut: BrowserShortcut, { command, find, tabs }: ShortcutTarget) {
    switch (shortcut) {
        case 'address': {
            const address = document.getElementById('browser-address') as HTMLInputElement | null;
            address?.focus();
            address?.select();
            return;
        }
        case 'reload':
        case 'hard-reload':
        case 'stop':
            command({ kind: 'navigate', action: shortcut });
            return;
        case 'find':
            find.open();
            return;
        case 'find-next':
        case 'find-previous':
            find.step(shortcut === 'find-next');
            return;
        case 'reopen-tab':
            tabs.reopenClosedTab();
            return;
        case 'next-tab':
        case 'previous-tab':
            selectIfAny(
                tabs,
                relativeTab(tabs.stripTabs, tabs.selectedTab, shortcut === 'next-tab' ? 1 : -1)
            );
            return;
        default:
            if (shortcut.startsWith('tab-')) {
                selectIfAny(tabs, numberedTab(tabs.stripTabs, Number(shortcut.slice(4))));
            }
    }
}

function selectIfAny({ selectTab }: ShortcutTabs, ref: WorkspaceTabRef | null) {
    if (ref) {
        selectTab(ref);
    }
}

function isEditable(target: EventTarget | null) {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
    );
}
