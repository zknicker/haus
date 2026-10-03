'use strict';
const { expect, test } = require('bun:test');
const {
    appMenuShortcuts,
    browserShortcut: browserShortcutOn,
    installBrowserShortcuts,
} = require('./browser-shortcuts.cjs');

const key = (value, modifiers = {}) => ({ type: 'keyDown', key: value, ...modifiers });

test('keys pressed in an isolated website run the shared action and never reach the page', () => {
    let handler;
    const actions = [];
    const contents = {
        isLoading: () => false,
        on: (_event, listener) => {
            handler = listener;
        },
    };
    installBrowserShortcuts(contents, (action) => actions.push(action), 'darwin');
    const press = (input) => {
        let prevented = false;
        handler({ preventDefault: () => (prevented = true) }, input);
        return prevented;
    };
    expect(press(key('l', { meta: true }))).toBe(true);
    expect(press(key('T', { meta: true, shift: true }))).toBe(true);
    // Esc belongs to the page unless it is loading.
    expect(press(key('Escape'))).toBe(false);
    contents.isLoading = () => true;
    expect(press(key('Escape'))).toBe(true);
    expect(press(key('a'))).toBe(false);
    // macOS Control-W and Control-T are the page's text keybindings, not tab commands.
    expect(press(key('w', { control: true }))).toBe(false);
    expect(press(key('t', { control: true }))).toBe(false);
    expect(actions).toEqual(['address', 'reopen-tab', 'stop']);
});

test('browser shortcuts map Chrome keys and leave ordinary website input alone', () => {
    const browserShortcut = (input) => browserShortcutOn(input, 'darwin');
    expect(browserShortcut(key('r'))).toBeNull();
    expect(browserShortcut({ type: 'keyUp', key: 'l', meta: true })).toBeNull();
    expect(browserShortcut(key('l', { meta: true, alt: true }))).toBeNull();
    expect(browserShortcut(key('Tab', { control: true, shift: true }))).toBe('previous-tab');
    expect(browserShortcut(key('9', { meta: true }))).toBe('tab-9');
    expect(browserShortcut(key('r', { meta: true }))).toBe('reload');
    expect(browserShortcut(key('R', { meta: true, shift: true }))).toBe('hard-reload');
    expect(browserShortcut(key('f', { meta: true }))).toBe('find');
    expect(browserShortcut(key('g', { meta: true }))).toBe('find-next');
    expect(browserShortcut(key('G', { meta: true, shift: true }))).toBe('find-previous');
    expect(browserShortcut(key('=', { meta: true }))).toBe('zoom-in');
    expect(browserShortcut(key('+', { meta: true, shift: true }))).toBe('zoom-in');
    expect(browserShortcut(key('-', { meta: true }))).toBe('zoom-out');
    expect(browserShortcut(key('0', { meta: true }))).toBe('zoom-reset');
    expect(browserShortcut(key('t', { meta: true }))).toBe('new-tab');
    expect(browserShortcut(key('w', { meta: true }))).toBe('close-tab');
    expect(browserShortcut(key(',', { meta: true }))).toBe('settings');
    expect(browserShortcut(key('W', { meta: true, shift: true }))).toBe('close-window');
    // Shift+[ reports `{` on US layouts; the physical key still counts.
    expect(browserShortcut(key('{', { meta: true, shift: true, code: 'BracketLeft' }))).toBe(
        'previous-tab'
    );
    expect(browserShortcut(key('}', { meta: true, shift: true }))).toBe('next-tab');
    expect(browserShortcut(key('[', { meta: true }))).toBeNull();
    expect(browserShortcut(key('Escape', { meta: true }))).toBeNull();
    for (const action of [
        'find',
        'new-tab',
        'close-tab',
        'close-window',
        'reopen-tab',
        'settings',
        'zoom-in',
    ]) {
        expect(appMenuShortcuts.has(action)).toBe(true);
    }
    expect(appMenuShortcuts.has('reload')).toBe(false);
});

test('Control is the command key off macOS only', () => {
    for (const letter of ['w', 't', 'l', '1']) {
        expect(browserShortcutOn(key(letter, { control: true }), 'darwin')).toBeNull();
        expect(browserShortcutOn(key(letter, { meta: true }), 'linux')).toBeNull();
    }
    expect(browserShortcutOn(key('w', { control: true }), 'win32')).toBe('close-tab');
    expect(browserShortcutOn(key('T', { control: true, shift: true }), 'linux')).toBe('reopen-tab');
    expect(browserShortcutOn(key('w', { meta: true }), 'darwin')).toBe('close-tab');
    // Command-Control combos belong to macOS (Command-Control-F is full screen).
    expect(browserShortcutOn(key('f', { meta: true, control: true }), 'darwin')).toBeNull();
    // Control-Tab cycles tabs everywhere, as in Chrome.
    expect(browserShortcutOn(key('Tab', { control: true }), 'darwin')).toBe('next-tab');
    expect(browserShortcutOn(key('Tab', { control: true }), 'linux')).toBe('next-tab');
    expect(browserShortcutOn(key('Escape', { control: true }), 'darwin')).toBeNull();
});
