import { describe, expect, test } from 'bun:test';
import { colorThemeDefinition } from '../lib/color-themes.ts';
import { resolveTheme } from './theme-provider.tsx';

describe('resolved mode', () => {
    test('Default follows the stored preference, and System follows the OS', () => {
        expect(resolveTheme('light', 'default', 'dark')).toBe('light');
        expect(resolveTheme('dark', 'default', 'light')).toBe('dark');
        expect(resolveTheme('system', 'default', 'light')).toBe('light');
        expect(resolveTheme('system', 'default', 'dark')).toBe('dark');
    });

    test('a definition that forces dark pins it over every preference', () => {
        expect(colorThemeDefinition('halloween').forcedMode).toBe('dark');
        expect(colorThemeDefinition('default').forcedMode).toBeNull();
        expect(resolveTheme('light', 'halloween', 'light')).toBe('dark');
        expect(resolveTheme('system', 'halloween', 'light')).toBe('dark');
        expect(resolveTheme('dark', 'halloween', 'light')).toBe('dark');
    });

    test('switching back to Default restores the stored preference', () => {
        const preference = 'light';
        expect(resolveTheme(preference, 'halloween', 'light')).toBe('dark');
        expect(resolveTheme(preference, 'default', 'light')).toBe('light');
    });
});
