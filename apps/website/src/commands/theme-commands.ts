import {
    ComputerIcon,
    MoonIcon,
    PaintBoardIcon,
    Sun01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { ThemePreference } from '../components/theme-provider.tsx';
import { selectColorTheme } from '../hooks/shell/use-color-theme.ts';
import type { ColorTheme } from '../lib/color-theme.ts';
import { colorThemes } from '../lib/color-themes.ts';
import type { AppCommandGroup } from './types.ts';

/**
 * Mode (Light/Dark/System) and color theme commands, matching Settings > Preferences > Appearance.
 * While the color theme pins the mode (`modeLocked`), the mode commands are hidden, as Settings
 * disables its Mode row.
 */
export function buildThemeCommandGroup({
    modeLocked,
    setColorTheme = selectColorTheme,
    setTheme,
}: {
    modeLocked: boolean;
    setColorTheme?: (theme: ColorTheme) => void;
    setTheme: (theme: ThemePreference) => void;
}): AppCommandGroup {
    const modeCommands = modeLocked ? [] : buildModeCommands(setTheme);
    const colorThemeCommands = colorThemes.map(({ id, label }) => ({
        id: `color-theme.${id}`,
        title: `Use ${label} Theme`,
        icon: PaintBoardIcon,
        keywords: ['appearance', 'theme', 'color', 'palette', id],
        run: () => setColorTheme(id),
    }));
    return {
        id: 'appearance',
        title: 'Appearance',
        commands: [...modeCommands, ...colorThemeCommands],
    };
}

function buildModeCommands(setTheme: (theme: ThemePreference) => void) {
    return (
        [
            { value: 'light', title: 'Use Light Mode', icon: Sun01Icon },
            { value: 'dark', title: 'Use Dark Mode', icon: MoonIcon },
            { value: 'system', title: 'Use System Mode', icon: ComputerIcon },
        ] as const
    ).map(({ value, title, icon }) => ({
        id: `theme.${value}`,
        title,
        icon,
        keywords: ['appearance', 'theme', 'color', 'mode', value],
        run: () => setTheme(value),
    }));
}
