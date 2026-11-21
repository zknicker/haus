import { describe, expect, test } from 'bun:test';
import { capyShellStorageKey, readCapyShell } from './capy-shell-preference.ts';

function storageWith(value: string | null) {
    return { getItem: (key: string) => (key === capyShellStorageKey ? value : null) };
}

describe('readCapyShell', () => {
    test('the Capy shell is on unless the person turned it off', () => {
        expect(readCapyShell(storageWith(null))).toBe(true);
        expect(readCapyShell(storageWith('on'))).toBe(true);
        expect(readCapyShell(storageWith('off'))).toBe(false);
        expect(readCapyShell(null)).toBe(true);
    });

    test('unreadable storage keeps the Capy shell on', () => {
        const throwing = {
            getItem: () => {
                throw new Error('blocked');
            },
        };
        expect(readCapyShell(throwing)).toBe(true);
    });
});
