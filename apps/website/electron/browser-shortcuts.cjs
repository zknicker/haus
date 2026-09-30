'use strict';

/**
 * The one key map for workspace tab and page shortcuts. A native page swallows
 * keys before the App menu or renderer sees them, so its `before-input-event`
 * maps every key here. While the App has focus, the renderer maps the same
 * keys (hooks/browser/browser-shortcut-keys.ts, parity-tested) except the ones
 * whose accelerators live in the App menu (`appMenuShortcuts`).
 */
const appMenuShortcuts = new Set([
    'close-tab',
    'find',
    'new-tab',
    'reopen-tab',
    'zoom-in',
    'zoom-out',
    'zoom-reset',
]);

const plainKeys = {
    f: 'find',
    g: 'find-next',
    l: 'address',
    r: 'reload',
    t: 'new-tab',
    w: 'close-tab',
};
const shiftedKeys = {
    g: 'find-previous',
    r: 'hard-reload',
    t: 'reopen-tab',
};

/** `input` is Electron's before-input-event shape: key, code, type, and modifier flags. */
function browserShortcut(input) {
    if (input.type !== 'keyDown' || input.alt) {
        return null;
    }
    const key = input.key.toLowerCase();
    const code = input.code ?? '';
    const command = input.meta || input.control;
    if (key === 'escape') {
        return command || input.shift ? null : 'stop';
    }
    if (input.control && key === 'tab') {
        return input.shift ? 'previous-tab' : 'next-tab';
    }
    return command ? commandShortcut(key, code, input.shift) : null;
}

function commandShortcut(key, code, shift) {
    if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') {
        return 'zoom-in';
    }
    if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
        return 'zoom-out';
    }
    if (shift) {
        if (key === '[' || key === '{' || code === 'BracketLeft') {
            return 'previous-tab';
        }
        if (key === ']' || key === '}' || code === 'BracketRight') {
            return 'next-tab';
        }
        return shiftedKeys[key] ?? null;
    }
    if (key === '0') {
        return 'zoom-reset';
    }
    if (/^[1-9]$/.test(key)) {
        return `tab-${key}`;
    }
    return plainKeys[key] ?? null;
}

/**
 * Keys pressed inside a page run `run(action)`. Esc stops a loading page and
 * otherwise stays with the page.
 */
function installBrowserShortcuts(contents, run) {
    contents.on('before-input-event', (event, input) => {
        const shortcut = browserShortcut(input);
        if (!shortcut || (shortcut === 'stop' && !contents.isLoading())) {
            return;
        }
        event.preventDefault();
        run(shortcut);
    });
}

module.exports = { appMenuShortcuts, browserShortcut, installBrowserShortcuts };
