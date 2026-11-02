import { describe, expect, test } from 'bun:test';
import { parseColorTheme } from './color-theme.ts';
import { colorThemeDefinition, colorThemes } from './color-themes.ts';

describe('color theme definitions', () => {
    test('every listed theme parses and resolves to its own definition', () => {
        expect(colorThemes.map(({ id }) => id)).toEqual([
            'default',
            'halloween',
            'christmas-eve',
            'christmas-morning',
        ]);
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

    test('Christmas Eve pins dark, Christmas Morning pins light', () => {
        const eve = colorThemeDefinition('christmas-eve');
        const morning = colorThemeDefinition('christmas-morning');
        expect(eve.label).toBe('Christmas Eve');
        expect(eve.forcedMode).toBe('dark');
        expect(morning.label).toBe('Christmas Morning');
        expect(morning.forcedMode).toBe('light');
    });

    test('both Christmas themes wear the Santa cap, draw the roofline, show the nightcap icon', () => {
        for (const id of ['christmas-eve', 'christmas-morning'] as const) {
            const christmas = colorThemeDefinition(id);
            expect(christmas.mascot).toBe('santa');
            expect(christmas.scene).toBe('snowy-roofline');
            expect(christmas.appIcon).toBe('santa');
        }
    });

    test('both Christmas themes greet from one innkeeper pool', () => {
        const eve = colorThemeDefinition('christmas-eve').greetings;
        expect(eve).not.toBeNull();
        expect(colorThemeDefinition('christmas-morning').greetings).toBe(eve);
        expect(eve?.morning.length).toBe(4);
        expect(eve?.afternoon.length).toBe(4);
        expect(eve?.evening.length).toBe(4);
    });
});
