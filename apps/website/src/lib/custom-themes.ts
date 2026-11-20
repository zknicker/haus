import { z } from 'zod';
import { type CustomThemeId, parseCustomThemeId } from './color-theme.ts';
import { noBackground, type ThemeBackground, themeBackgroundSchema } from './home-background.ts';

export const themeColorRoles = [
    { id: 'accent', label: 'Accent', tier: 'core', token: '--accent' },
    { id: 'background', label: 'Background', tier: 'core', token: '--background' },
    { id: 'foreground', label: 'Foreground', tier: 'core', token: '--foreground' },
    { id: 'sidebar', label: 'Sidebar', tier: 'advanced', token: '--sidebar-surface' },
    { id: 'card', label: 'Card', tier: 'advanced', token: '--surface' },
    { id: 'popover', label: 'Popover', tier: 'advanced', token: '--overlay' },
    { id: 'input', label: 'Input', tier: 'advanced', token: '--field-background' },
    { id: 'button', label: 'Button', tier: 'advanced', token: '--default' },
    { id: 'muted', label: 'Muted', tier: 'advanced', token: '--muted' },
    { id: 'border', label: 'Border', tier: 'advanced', token: '--border' },
    { id: 'link', label: 'Link', tier: 'advanced', token: '--link' },
    {
        id: 'accentForeground',
        label: 'Text on accent',
        tier: 'advanced',
        token: '--accent-foreground',
    },
] as const;

export type ThemeColorRole = (typeof themeColorRoles)[number];
export type ThemeColorRoleId = ThemeColorRole['id'];
type CoreRoleId = Extract<ThemeColorRole, { tier: 'core' }>['id'];
type AdvancedRoleId = Extract<ThemeColorRole, { tier: 'advanced' }>['id'];

export type HexColor = string & { readonly brand: 'HexColor' };

export type ThemeColors = Readonly<Record<CoreRoleId, HexColor>> &
    Readonly<Partial<Record<AdvancedRoleId, HexColor>>>;

export type ThemeMode = 'dark' | 'light';

export interface CustomTheme {
    readonly background: ThemeBackground;
    readonly dark: ThemeColors;
    readonly id: CustomThemeId;
    readonly light: ThemeColors;
    readonly name: string;
}

export const customThemesStorageKey = 'haus.custom-themes';

const hexPattern = /^#[0-9a-f]{6}$/u;

export function parseHexColor(value: unknown) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    return hexPattern.test(normalized) ? (normalized as HexColor) : null;
}

const hexSchema = z.string().transform((value, context) => {
    const hex = parseHexColor(value);
    if (!hex) {
        context.addIssue({ code: 'custom', message: 'not a #rrggbb color' });
        return z.NEVER;
    }
    return hex;
});

const colorsSchema = z.object(
    Object.fromEntries(
        themeColorRoles.map((role) => [
            role.id,
            role.tier === 'core' ? hexSchema : hexSchema.optional().catch(undefined),
        ])
    )
);

const customThemeSchema = z.object({
    background: themeBackgroundSchema.catch(noBackground),
    dark: colorsSchema,
    id: z.string().transform((value, context) => {
        const id = parseCustomThemeId(value);
        if (!id) {
            context.addIssue({ code: 'custom', message: 'not a custom theme id' });
            return z.NEVER;
        }
        return id;
    }),
    light: colorsSchema,
    name: z.string().trim().min(1).max(40),
});

export function parseCustomThemes(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.flatMap((entry) => {
        const parsed = customThemeSchema.safeParse(entry);
        return parsed.success ? [parsed.data as CustomTheme] : [];
    });
}

export function readStoredCustomThemes(storage: Pick<Storage, 'getItem'> | null) {
    try {
        const raw = storage?.getItem(customThemesStorageKey);
        return raw ? parseCustomThemes(JSON.parse(raw)) : [];
    } catch {
        return [];
    }
}

export function writeStoredCustomThemes(
    storage: Pick<Storage, 'setItem'> | null,
    themes: readonly CustomTheme[]
) {
    try {
        storage?.setItem(customThemesStorageKey, JSON.stringify(themes));
    } catch {
        return;
    }
}

export function newCustomThemeId(random = Math.random) {
    return `custom-${Math.floor(random() * 36 ** 8)
        .toString(36)
        .padStart(8, '0')}` as CustomThemeId;
}

export function nextCustomThemeName(themes: readonly CustomTheme[]) {
    const taken = new Set(themes.map((theme) => theme.name));
    let index = 1;
    while (taken.has(index === 1 ? 'Custom' : `Custom ${index}`)) {
        index += 1;
    }
    return index === 1 ? 'Custom' : `Custom ${index}`;
}

export function withThemeColor(
    colors: ThemeColors,
    role: ThemeColorRoleId,
    color: HexColor | null
) {
    if (color) {
        return { ...colors, [role]: color } as ThemeColors;
    }
    const isCore = themeColorRoles.some((entry) => entry.id === role && entry.tier === 'core');
    if (isCore) {
        return colors;
    }
    const { [role]: _removed, ...rest } = colors;
    return rest as ThemeColors;
}

export function customThemeCss(themes: readonly CustomTheme[]) {
    return themes
        .flatMap((theme) =>
            (['light', 'dark'] as const).map(
                (mode) =>
                    `[data-color-theme="${theme.id}"][data-palette][data-theme="${mode}"] { ${tokenDeclarations(theme[mode])} }`
            )
        )
        .join('\n');
}

function tokenDeclarations(colors: ThemeColors) {
    return themeColorRoles
        .flatMap((role) => {
            const color = colors[role.id];
            return color ? [`${role.token}: ${color};`] : [];
        })
        .join(' ');
}
