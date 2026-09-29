import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { BrowserCommand, BrowserWorkspaceState } from '../../lib/desktop-browser.ts';

export function useBrowserShortcuts(
    state: BrowserWorkspaceState,
    command: (input: BrowserCommand) => void
) {
    React.useEffect(() => {
        const bridge = getDesktopBridge();
        if (!bridge?.browserCommand) {
            return;
        }
        const run = (shortcut: string) => runBrowserShortcut(shortcut, state, command);
        const onKeyDown = (event: KeyboardEvent) => {
            const shortcut = keyboardShortcut(event);
            if (!shortcut || (!state.activeId && ['address', 'reload'].includes(shortcut))) {
                return;
            }
            event.preventDefault();
            run(shortcut);
        };
        const unsubscribe = bridge.onBrowserShortcut?.(run);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            unsubscribe?.();
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [state, command]);
}

function runBrowserShortcut(
    shortcut: string,
    state: BrowserWorkspaceState,
    command: (input: BrowserCommand) => void
) {
    if (shortcut === 'address' && state.activeId) {
        const address = document.getElementById('browser-address') as HTMLInputElement | null;
        address?.focus();
        address?.select();
        return;
    }
    if (shortcut === 'reload' && state.activeId) {
        command({ kind: 'navigate', action: 'reload' });
        return;
    }
    const ids = [null, ...state.tabs.map((tab) => tab.id)];
    if (shortcut === 'next-tab' || shortcut === 'previous-tab') {
        const offset = shortcut === 'next-tab' ? 1 : -1;
        const index = (ids.indexOf(state.activeId) + offset + ids.length) % ids.length;
        command({ kind: 'select', id: ids[index] ?? null });
        return;
    }
    if (/^tab-[1-9]$/.test(shortcut)) {
        const index = Number(shortcut.slice(4));
        const id = index === 9 ? ids.at(-1) : ids[index - 1];
        if (id !== undefined) {
            command({ kind: 'select', id });
        }
    }
}

function keyboardShortcut(event: KeyboardEvent): string | null {
    if (event.altKey) {
        return null;
    }
    const key = event.key.toLowerCase();
    if (event.ctrlKey && key === 'tab') {
        return event.shiftKey ? 'previous-tab' : 'next-tab';
    }
    if (!(event.metaKey || event.ctrlKey)) {
        return null;
    }
    if (key === 'l') {
        return 'address';
    }
    if (key === 'r') {
        return 'reload';
    }
    if (/^[1-9]$/.test(key)) {
        return `tab-${key}`;
    }
    if (event.shiftKey && key === '[') {
        return 'previous-tab';
    }
    if (event.shiftKey && key === ']') {
        return 'next-tab';
    }
    return null;
}
