import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { appShortcut, parseBrowserShortcut } from './browser-shortcut-keys.ts';

const require = createRequire(import.meta.url);
const main = require('../../../electron/browser-shortcuts.cjs') as {
    browserShortcut: (input: Record<string, unknown>, platform: string) => string | null;
    isAppMenuShortcut: (shortcut: string, input: Record<string, unknown>) => boolean;
};

const keys: [key: string, code: string][] = [
    ...'abcdefghijklmnopqrstuvwxyz'
        .split('')
        .map((key): [string, string] => [key, `Key${key.toUpperCase()}`]),
    ...'0123456789'.split('').map((key): [string, string] => [key, `Digit${key}`]),
    ['=', 'Equal'],
    ['+', 'Equal'],
    ['-', 'Minus'],
    ['_', 'Minus'],
    ['[', 'BracketLeft'],
    ['{', 'BracketLeft'],
    [']', 'BracketRight'],
    ['}', 'BracketRight'],
    [',', 'Comma'],
    ['Tab', 'Tab'],
    ['Escape', 'Escape'],
    ['Enter', 'Enter'],
    ['ArrowLeft', 'ArrowLeft'],
    ['ArrowRight', 'ArrowRight'],
];

test.each([
    ['darwin', true],
    ['linux', false],
] as const)('App-focused shortcuts match page-focused ones on %s, minus App menu keys', (platform, isMac) => {
    for (const [key, code] of keys) {
        for (let flags = 0; flags < 16; flags++) {
            const [metaKey, ctrlKey, shiftKey, altKey] = [1, 2, 4, 8].map((bit) =>
                Boolean(flags & bit)
            );
            const input = {
                type: 'keyDown',
                key: shiftKey && key.length === 1 ? key.toUpperCase() : key,
                code,
                meta: metaKey,
                control: ctrlKey,
                shift: shiftKey,
                alt: altKey,
            };
            const fromPage = main.browserShortcut(input, platform);
            const expected = fromPage && main.isAppMenuShortcut(fromPage, input) ? null : fromPage;
            const fromApp: string | null = appShortcut(
                { altKey, code, ctrlKey, key: input.key, metaKey, shiftKey },
                isMac
            );
            expect({ input, shortcut: fromApp }).toEqual({ input, shortcut: expected });
        }
    }
});

test('Control is the command key off macOS only', () => {
    const press = (
        key: string,
        modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }
    ) => ({
        altKey: false,
        code: '',
        ctrlKey: false,
        key,
        metaKey: false,
        shiftKey: false,
        ...modifiers,
    });
    expect(appShortcut(press('l', { ctrlKey: true }), true)).toBeNull();
    expect(appShortcut(press('1', { ctrlKey: true }), true)).toBeNull();
    expect(appShortcut(press('l', { metaKey: true }), true)).toBe('address');
    expect(appShortcut(press('l', { ctrlKey: true }), false)).toBe('address');
    expect(appShortcut(press('1', { metaKey: true }), false)).toBeNull();
    expect(appShortcut(press('Tab', { ctrlKey: true }), true)).toBe('next-tab');
    // The side-pane toggle is gone with the side pane (ADR 0039).
    expect(appShortcut(press('b', { metaKey: true, shiftKey: true }), true)).toBeNull();
});

test('forwarded shortcut names are validated', () => {
    expect(parseBrowserShortcut('reopen-tab')).toBe('reopen-tab');
    expect(parseBrowserShortcut('tab-3')).toBe('tab-3');
    expect(parseBrowserShortcut('tab-0')).toBeNull();
    expect(parseBrowserShortcut('rm -rf')).toBeNull();
    expect(parseBrowserShortcut('toggle-side-pane')).toBeNull();
});
