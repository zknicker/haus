import { type ColorTheme, defaultColorTheme, isCustomTheme } from './color-theme.ts';
import { colorThemeDefinition } from './color-themes.ts';
import { type CustomTheme, customThemeCss, type ThemeMode } from './custom-themes.ts';

const customThemeStyleId = 'haus-custom-themes';

export function stampAppearance(root: HTMLElement, mode: ThemeMode, colorTheme: ColorTheme) {
    root.dataset.theme = mode;
    root.style.colorScheme = mode;
    root.classList.toggle('dark', mode === 'dark');
    root.dataset.colorTheme = colorTheme;
    root.toggleAttribute('data-palette', colorThemeDefinition(colorTheme).ground === 'palette');
}

export function installCustomThemeStyles(document: Document, themes: readonly CustomTheme[]) {
    const existing = document.getElementById(customThemeStyleId);
    const style = existing ?? document.createElement('style');
    style.id = customThemeStyleId;
    style.textContent = customThemeCss(themes);
    if (!existing) {
        document.head.append(style);
    }
}

export function resolveColorTheme(selection: ColorTheme, themes: readonly CustomTheme[]) {
    const missing = isCustomTheme(selection) && !themes.some((theme) => theme.id === selection);
    return missing ? defaultColorTheme : selection;
}
