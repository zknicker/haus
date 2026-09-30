import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { appShortcut, parseBrowserShortcut } from './browser-shortcut-keys.ts';

const require = createRequire(import.meta.url);
const main = require('../../../electron/browser-shortcuts.cjs') as {
    appMenuShortcuts: Set<string>;
    browserShortcut: (input: Record<string, unknown>) => string | null;
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
    ['Tab', 'Tab'],
    ['Escape', 'Escape'],
    ['Enter', 'Enter'],
];

test('App-focused shortcuts match page-focused ones, minus the keys the App menu owns', () => {
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
            const fromPage = main.browserShortcut(input);
            const expected = fromPage && main.appMenuShortcuts.has(fromPage) ? null : fromPage;
            const fromApp: string | null = appShortcut({
                altKey,
                code,
                ctrlKey,
                key: input.key,
                metaKey,
                shiftKey,
            });
            expect({ input, shortcut: fromApp }).toEqual({ input, shortcut: expected });
        }
    }
});

test('forwarded shortcut names are validated', () => {
    expect(parseBrowserShortcut('reopen-tab')).toBe('reopen-tab');
    expect(parseBrowserShortcut('tab-3')).toBe('tab-3');
    expect(parseBrowserShortcut('tab-0')).toBeNull();
    expect(parseBrowserShortcut('rm -rf')).toBeNull();
});
