import { expect, test } from 'bun:test';
import { isAppForegrounded } from './use-app-foregrounded.ts';

test('the app is foregrounded only when its document is visible and window is focused', () => {
    expect(isAppForegrounded({ documentVisible: true, windowFocused: true })).toBe(true);
    expect(isAppForegrounded({ documentVisible: false, windowFocused: true })).toBe(false);
    expect(isAppForegrounded({ documentVisible: true, windowFocused: false })).toBe(false);
});
