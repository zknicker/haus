import { expect, test } from 'bun:test';
import type { ThemePreference } from '../components/theme-provider.tsx';
import type { ColorTheme } from '../lib/color-theme.ts';
import { buildThemeCommandGroup } from './theme-commands.ts';
import { getCommandSearchText } from './types.ts';

test('appearance commands are searchable and apply each mode and color theme', async () => {
    const modes: ThemePreference[] = [];
    const colorThemes: ColorTheme[] = [];
    const group = buildThemeCommandGroup({
        modeLocked: false,
        setColorTheme: (theme) => {
            colorThemes.push(theme);
        },
        setTheme: (theme) => {
            modes.push(theme);
        },
    });
    expect(group.commands.map((command) => command.id)).toEqual([
        'theme.light',
        'theme.dark',
        'theme.system',
        'color-theme.default',
        'color-theme.halloween',
    ]);
    for (const command of group.commands) {
        expect(getCommandSearchText(command).toLowerCase()).toContain('theme');
        expect(getCommandSearchText(command).toLowerCase()).toContain(
            command.id.split('.')[1] ?? ''
        );
        await command.run();
    }
    expect(modes).toEqual(['light', 'dark', 'system']);
    expect(colorThemes).toEqual(['default', 'halloween']);
});

test('a color theme that pins the mode hides the mode commands', () => {
    const group = buildThemeCommandGroup({
        modeLocked: true,
        setColorTheme: () => undefined,
        setTheme: () => undefined,
    });
    expect(group.commands.map((command) => command.id)).toEqual([
        'color-theme.default',
        'color-theme.halloween',
    ]);
});
