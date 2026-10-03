/**
 * Workspace tab and page shortcuts while the App has focus. This mirrors
 * `electron/browser-shortcuts.cjs`, which maps the same keys while a native
 * page has focus (parity-tested), minus the keys the App menu owns: New Tab,
 * Close, Reopen Closed Tab, Find, and Zoom reach the renderer through the menu
 * so they never fire twice.
 */
export type BrowserShortcut =
    | 'address'
    | 'close-tab'
    | 'find'
    | 'find-next'
    | 'find-previous'
    | 'hard-reload'
    | 'new-tab'
    | 'next-tab'
    | 'previous-tab'
    | 'reload'
    | 'reopen-tab'
    | 'stop'
    | 'toggle-side-pane'
    | 'zoom-in'
    | 'zoom-out'
    | 'zoom-reset'
    | `tab-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface ShortcutKey {
    altKey: boolean;
    code: string;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
}

/**
 * Shortcuts the renderer handles from its own keydown events. The command key
 * is Command on macOS and Control elsewhere; macOS Control combos stay with
 * text fields' native keybindings.
 */
export function appShortcut(event: ShortcutKey, isMac: boolean): BrowserShortcut | null {
    if (event.altKey) {
        return null;
    }
    const key = event.key.toLowerCase();
    const command = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (key === 'escape') {
        return event.metaKey || event.ctrlKey || event.shiftKey ? null : 'stop';
    }
    if (event.ctrlKey && key === 'tab') {
        return event.shiftKey ? 'previous-tab' : 'next-tab';
    }
    return command ? commandShortcut(key, event.code, event.shiftKey) : null;
}

function commandShortcut(key: string, code: string, shift: boolean): BrowserShortcut | null {
    if (shift) {
        if (key === '[' || key === '{' || code === 'BracketLeft') {
            return 'previous-tab';
        }
        if (key === ']' || key === '}' || code === 'BracketRight') {
            return 'next-tab';
        }
        return shiftedKeys[key] ?? null;
    }
    if (/^[1-9]$/.test(key)) {
        return `tab-${key}` as BrowserShortcut;
    }
    return plainKeys[key] ?? null;
}

/** Electron's renderer reports the host OS in its user agent. */
export function isMacPlatform() {
    return typeof navigator !== 'undefined' && navigator.userAgent.includes('Macintosh');
}

/** Validates a shortcut name forwarded from the main process. */
export function parseBrowserShortcut(value: string): BrowserShortcut | null {
    return (shortcutNames as readonly string[]).includes(value) || /^tab-[1-9]$/.test(value)
        ? (value as BrowserShortcut)
        : null;
}

const plainKeys: Record<string, BrowserShortcut> = {
    g: 'find-next',
    l: 'address',
    r: 'reload',
};
const shiftedKeys: Record<string, BrowserShortcut> = {
    b: 'toggle-side-pane',
    g: 'find-previous',
    r: 'hard-reload',
};
const shortcutNames = [
    'address',
    'close-tab',
    'find',
    'find-next',
    'find-previous',
    'hard-reload',
    'new-tab',
    'next-tab',
    'previous-tab',
    'reload',
    'reopen-tab',
    'stop',
    'toggle-side-pane',
    'zoom-in',
    'zoom-out',
    'zoom-reset',
] as const;
