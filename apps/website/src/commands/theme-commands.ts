import {
    ComputerIcon,
    MoonIcon,
    PaintBoardIcon,
    SnowIcon,
    Sun01Icon,
} from '@hugeicons-pro/core-stroke-rounded';
import type { ThemePreference } from '../components/theme-provider.tsx';
import { selectColorTheme } from '../hooks/shell/use-color-theme.ts';
import { selectRooflineSnow } from '../hooks/shell/use-roofline-snow.ts';
import type { ColorTheme } from '../lib/color-theme.ts';
import { type ColorThemeDefinition, colorThemes } from '../lib/color-themes.ts';
import { type RooflineSnow, rooflineSnows } from '../lib/roofline-snow.ts';
import type { AppCommandGroup } from './types.ts';

/**
 * Mode (Light/Dark/System), color theme, and snow commands, matching Settings > Preferences >
 * Appearance. While the color theme pins the mode (`modeLocked`), the mode commands are hidden, as
 * Settings disables its Mode row; the snow commands show only while the theme's `scene` is the
 * snowy roofline, as Settings shows its Snow row.
 */
export function buildThemeCommandGroup({
    modeLocked,
    scene,
    setColorTheme = selectColorTheme,
    setRooflineSnow = selectRooflineSnow,
    setTheme,
}: {
    modeLocked: boolean;
    scene: ColorThemeDefinition['scene'];
    setColorTheme?: (theme: ColorTheme) => void;
    setRooflineSnow?: (snow: RooflineSnow) => void;
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
    const snowCommands = scene === 'snowy-roofline' ? buildSnowCommands(setRooflineSnow) : [];
    return {
        id: 'appearance',
        title: 'Appearance',
        commands: [...modeCommands, ...colorThemeCommands, ...snowCommands],
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

function buildSnowCommands(setRooflineSnow: (snow: RooflineSnow) => void) {
    return rooflineSnows.map(({ id, label }) => ({
        id: `roofline-snow.${id}`,
        title: `Use ${label} Snow`,
        icon: SnowIcon,
        keywords: ['appearance', 'snow', 'christmas', 'roofline', id],
        run: () => setRooflineSnow(id),
    }));
}
