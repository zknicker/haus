import { expect, test } from 'bun:test';
import type { ThemePreference } from '../components/theme-provider.tsx';
import type { ColorTheme } from '../lib/color-theme.ts';
import type { RooflineSnow } from '../lib/roofline-snow.ts';
import { buildThemeCommandGroup } from './theme-commands.ts';
import { getCommandSearchText } from './types.ts';

const colorThemeIds = [
    'color-theme.default',
    'color-theme.halloween',
    'color-theme.christmas-eve',
    'color-theme.christmas-morning',
];

test('appearance commands are searchable and apply each mode and color theme', async () => {
    const modes: ThemePreference[] = [];
    const colorThemes: ColorTheme[] = [];
    const group = buildThemeCommandGroup({
        modeLocked: false,
        scene: 'none',
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
        ...colorThemeIds,
    ]);
    for (const command of group.commands) {
        expect(getCommandSearchText(command).toLowerCase()).toContain('theme');
        expect(getCommandSearchText(command).toLowerCase()).toContain(
            command.id.split('.')[1] ?? ''
        );
        await command.run();
    }
    expect(modes).toEqual(['light', 'dark', 'system']);
    expect(colorThemes).toEqual(['default', 'halloween', 'christmas-eve', 'christmas-morning']);
});

test('a color theme that pins the mode hides the mode commands', () => {
    const group = buildThemeCommandGroup({
        modeLocked: true,
        scene: 'none',
        setColorTheme: () => undefined,
        setTheme: () => undefined,
    });
    expect(group.commands.map((command) => command.id)).toEqual(colorThemeIds);
});

test('a snowy roofline adds searchable snow commands that apply each snow', async () => {
    const snows: RooflineSnow[] = [];
    const group = buildThemeCommandGroup({
        modeLocked: true,
        scene: 'snowy-roofline',
        setColorTheme: () => undefined,
        setRooflineSnow: (snow) => {
            snows.push(snow);
        },
        setTheme: () => undefined,
    });
    const snowCommands = group.commands.filter((command) =>
        command.id.startsWith('roofline-snow.')
    );
    expect(group.commands.map((command) => command.id)).toEqual([
        ...colorThemeIds,
        'roofline-snow.puffy',
        'roofline-snow.soft',
        'roofline-snow.icicles',
    ]);
    expect(snowCommands.map((command) => command.title)).toEqual([
        'Use Puffy Snow',
        'Use Soft Snow',
        'Use Icicles Snow',
    ]);
    for (const command of snowCommands) {
        const searchText = getCommandSearchText(command).toLowerCase();
        for (const keyword of ['appearance', 'snow', 'christmas', command.id.split('.')[1]]) {
            expect(searchText).toContain(keyword ?? '');
        }
        await command.run();
    }
    expect(snows).toEqual(['puffy', 'soft', 'icicles']);
});

test('no other scene offers snow commands', () => {
    for (const scene of ['none', 'moonlit-sky'] as const) {
        const group = buildThemeCommandGroup({
            modeLocked: false,
            scene,
            setTheme: () => undefined,
        });
        expect(group.commands.some((command) => command.id.startsWith('roofline-snow.'))).toBe(
            false
        );
    }
});
