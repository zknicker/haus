import { expect, test } from 'bun:test';
import { suffixProjectKey, suggestProjectKey } from './project-key.ts';
import { TASK_KEY_PREFIX_PATTERN } from './task-key-ledger.ts';

test('a Project key takes the first four letters and digits of its name, uppercased', () => {
    expect(suggestProjectKey('security')).toBe('SECU');
    expect(suggestProjectKey('ops')).toBe('OPS');
    expect(suggestProjectKey('web-app_2')).toBe('WEBA');
    expect(suggestProjectKey('Haus')).toBe('HAUS');
});

test('a short name pads with X and a digit-first name takes a P prefix', () => {
    expect(suggestProjectKey('a')).toBe('AX');
    expect(suggestProjectKey('q-')).toBe('QX');
    expect(suggestProjectKey('2024-plans')).toBe('P202');
    expect(suggestProjectKey('7')).toBe('P7');
});

test('a name with no letter or digit has no base', () => {
    expect(suggestProjectKey('---')).toBeNull();
    expect(suggestProjectKey('_')).toBeNull();
});

test('a collision suffix trims the base so the key stays within five characters', () => {
    expect(suffixProjectKey('OPS', 2)).toBe('OPS2');
    expect(suffixProjectKey('SECU', 2)).toBe('SECU2');
    expect(suffixProjectKey('SECU', 10)).toBe('SEC10');
    expect(suffixProjectKey('AX', 3)).toBe('AX3');
});

test('every suggested key and suffix fits the ledger pattern', () => {
    const names = ['security', 'a', '2024-plans', 'web-app_2', 'z9'];
    const keys = names.flatMap((name) => {
        const base = suggestProjectKey(name) ?? 'P';
        return [base, suffixProjectKey(base, 2), suffixProjectKey(base, 99)];
    });
    expect(keys.filter((key) => !TASK_KEY_PREFIX_PATTERN.test(key))).toEqual([]);
});
