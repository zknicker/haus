import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserCommand, BrowserTab } from '../../lib/desktop-browser.ts';
import {
    appShortcut,
    type BrowserShortcut,
    isMacPlatform,
    parseBrowserShortcut,
} from './browser-shortcut-keys.ts';
import { browserAddressId } from './browser-views-context.ts';
import type { BrowserFind } from './use-browser-find.ts';

interface ShortcutTarget {
    /** The shown browser tab, if a browser page is on screen. */
    browserTab: BrowserTab | null;
    command: (input: BrowserCommand) => void;
    find: BrowserFind;
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
 * Runs page shortcuts (address, reload, stop, find) from both focus paths: the
 * App's own keydown events, and shortcuts the main process forwards from the
 * App menu or a focused native page (electron/browser-shortcuts.cjs). Tab
 * shortcuts belong to `useDesktopTabShortcuts`.
 */
export function useBrowserShortcuts(target: ShortcutTarget) {
    const latest = React.useRef(target);
    latest.current = target;
    React.useEffect(() => {
        const bridge = getDesktopBridge();
        if (!bridge?.browserCommand) {
            return;
        }
        const isMac = isMacPlatform();
        const onKeyDown = (event: KeyboardEvent) => {
            const shortcut = appShortcut(event, isMac);
            if (
                !shortcut ||
                event.defaultPrevented ||
                isInDialog(event.target) ||
                !applies(shortcut, latest.current)
            ) {
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
    return browserTab !== null && pageShortcuts.has(shortcut);
}

function runBrowserShortcut(
    shortcut: BrowserShortcut,
    { browserTab, command, find }: ShortcutTarget
) {
    switch (shortcut) {
        case 'address': {
            const address = browserTab
                ? (document.getElementById(
                      browserAddressId(browserTab.id)
                  ) as HTMLInputElement | null)
                : null;
            address?.focus();
            address?.select();
            return;
        }
        case 'reload':
        case 'hard-reload':
        case 'stop':
            command({ kind: 'navigate', action: shortcut, id: browserTab?.id });
            return;
        case 'find':
            find.open();
            return;
        case 'find-next':
        case 'find-previous':
            find.step(shortcut === 'find-next');
            return;
        default:
            return;
    }
}

/** Keys pressed inside a dialog (modal focus is trapped there) belong to the dialog. */
function isInDialog(target: EventTarget | null) {
    return (
        target instanceof Element &&
        target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') !== null
    );
}

function isEditable(target: EventTarget | null) {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
    );
}
