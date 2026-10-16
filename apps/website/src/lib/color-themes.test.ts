import { describe, expect, test } from 'bun:test';
import { parseColorTheme } from './color-theme.ts';
import { colorThemeDefinition, colorThemes } from './color-themes.ts';

describe('color theme definitions', () => {
    test('every listed theme parses and resolves to its own definition', () => {
        expect(colorThemes.map(({ id }) => id)).toEqual(['default', 'halloween']);
        for (const definition of colorThemes) {
            expect(parseColorTheme(definition.id)).toBe(definition.id);
            expect(colorThemeDefinition(definition.id)).toBe(definition);
        }
    });

    test('Default changes nothing: the ghost, no scene, the standard greeting, the own mode', () => {
        expect(colorThemeDefinition('default')).toEqual({
            appIcon: 'ghost',
            forcedMode: null,
            greetings: null,
            id: 'default',
            label: 'Default',
            mascot: 'ghost',
            scene: 'none',
        });
    });

    test('Halloween pins dark, wears the pumpkin, and draws the moonlit sky', () => {
        const halloween = colorThemeDefinition('halloween');
        expect(halloween.label).toBe('Halloween');
        expect(halloween.forcedMode).toBe('dark');
        expect(halloween.mascot).toBe('pumpkin');
        expect(halloween.scene).toBe('moonlit-sky');
        expect(halloween.greetings?.morning.length).toBe(4);
        expect(halloween.greetings?.afternoon.length).toBe(4);
        expect(halloween.greetings?.evening.length).toBe(4);
    });
});
