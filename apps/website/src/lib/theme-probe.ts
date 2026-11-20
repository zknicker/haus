import type { ColorTheme } from './color-theme.ts';
import { colorThemeDefinition } from './color-themes.ts';
import {
    type HexColor,
    type ThemeColorRoleId,
    type ThemeMode,
    themeColorRoles,
} from './custom-themes.ts';

export type ResolvedThemeColors = Readonly<Record<ThemeColorRoleId, HexColor>>;

export function readThemeColors(document: Document, theme: ColorTheme, mode: ThemeMode) {
    const probe = document.createElement('div');
    probe.className = 'theme-preview';
    probe.hidden = true;
    probe.dataset.colorTheme = theme;
    probe.dataset.theme = mode;
    probe.toggleAttribute('data-palette', colorThemeDefinition(theme).ground === 'palette');
    document.body.append(probe);
    const context = pixelContext(document);
    const colors = Object.fromEntries(
        themeColorRoles.map((role) => {
            probe.style.color = `var(${role.token})`;
            return [role.id, toHex(context, getComputedStyle(probe).color)];
        })
    );
    probe.remove();
    return colors as ResolvedThemeColors;
}

function pixelContext(document: Document) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        throw new Error('Canvas 2D is unavailable, so theme colors cannot be read.');
    }
    return context;
}

function toHex(context: CanvasRenderingContext2D, color: string) {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}` as HexColor;
}
