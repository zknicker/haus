'use strict';
const { expect, test } = require('bun:test');
const { browserShortcut, installBrowserShortcuts } = require('./browser-shortcuts.cjs');

test('browser shortcuts work when focus belongs to an isolated website', () => {
    let handler;
    const messages = [];
    let focused = false;
    installBrowserShortcuts(
        {
            on: (_event, listener) => {
                handler = listener;
            },
        },
        {
            webContents: {
                focus: () => {
                    focused = true;
                },
                send: (...message) => messages.push(message),
            },
        }
    );
    let prevented = false;
    handler(
        {
            preventDefault: () => {
                prevented = true;
            },
        },
        { type: 'keyDown', key: 'l', meta: true }
    );
    expect(prevented).toBe(true);
    expect(focused).toBe(true);
    expect(messages).toEqual([['desktop:browser:shortcut', 'address']]);
});

test('browser shortcuts leave ordinary website input alone', () => {
    expect(browserShortcut({ type: 'keyDown', key: 'r' })).toBeNull();
    expect(browserShortcut({ type: 'keyUp', key: 'l', meta: true })).toBeNull();
    expect(browserShortcut({ type: 'keyDown', key: 'l', meta: true, alt: true })).toBeNull();
    expect(browserShortcut({ type: 'keyDown', key: 'Tab', control: true, shift: true })).toBe(
        'previous-tab'
    );
    expect(browserShortcut({ type: 'keyDown', key: '9', meta: true })).toBe('tab-9');
});
