import { expect, test } from 'vitest';
import { isSelectAllShortcut } from './select-all.ts';

test('recognizes platform select-all shortcuts without extra modifiers', () => {
    expect(isSelectAllShortcut({ key: 'a', metaKey: true })).toBe(true);
    expect(isSelectAllShortcut({ key: 'A', ctrlKey: true })).toBe(true);
    expect(isSelectAllShortcut({ key: 'a', metaKey: true, shiftKey: true })).toBe(false);
    expect(isSelectAllShortcut({ key: 'a', altKey: true, metaKey: true })).toBe(false);
    expect(isSelectAllShortcut({ key: 'b', metaKey: true })).toBe(false);
});
