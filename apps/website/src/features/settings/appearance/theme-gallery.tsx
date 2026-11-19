import { ItemCardGroup, RadioButtonGroup } from '@heroui-pro/react';
import { Button, Label } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { useTheme } from '../../../components/theme-provider.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { selectColorTheme, useColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import { createCustomTheme, useCustomThemes } from '../../../hooks/shell/use-custom-themes.ts';
import { type ColorTheme, parseColorTheme } from '../../../lib/color-theme.ts';
import { colorThemes } from '../../../lib/color-themes.ts';
import type { ThemeMode } from '../../../lib/custom-themes.ts';
import { readThemeColors } from '../../../lib/theme-probe.ts';
import { ThemePreview } from './theme-preview.tsx';

export function ThemeGallery() {
    const theme = useColorTheme();
    const customThemes = useCustomThemes();
    const { resolvedTheme } = useTheme();
    const tiles = [
        ...colorThemes.map(({ forcedMode, id, label }) => ({ forcedMode, id, label })),
        ...customThemes.map(({ id, name }) => ({ forcedMode: null, id, label: name })),
    ];

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between">
                <ItemCardGroup.Title>Theme</ItemCardGroup.Title>
                <Button onPress={() => createThemeFrom(theme)} size="sm" variant="ghost">
                    <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                    Create theme
                </Button>
            </ItemCardGroup.Header>
            <RadioButtonGroup
                aria-label="Theme"
                className="theme-gallery grid-cols-4"
                layout="grid"
                onChange={applyColorTheme}
                value={theme}
            >
                {tiles.map((tile) => (
                    <RadioButtonGroup.Item key={tile.id} value={tile.id}>
                        <RadioButtonGroup.ItemContent>
                            <ThemePreview mode={tile.forcedMode ?? resolvedTheme} theme={tile.id} />
                            <Label className="max-w-full truncate" title={tile.label}>
                                {tile.label}
                            </Label>
                        </RadioButtonGroup.ItemContent>
                    </RadioButtonGroup.Item>
                ))}
            </RadioButtonGroup>
        </ItemCardGroup>
    );
}

export function applyColorTheme(value: unknown) {
    const next = parseColorTheme(value);
    if (next) {
        selectColorTheme(next);
    }
}

function createThemeFrom(theme: ColorTheme) {
    const seed = (mode: ThemeMode) => {
        const { accent, background, foreground } = readThemeColors(document, theme, mode);
        return { accent, background, foreground };
    };
    selectColorTheme(createCustomTheme({ dark: seed('dark'), light: seed('light') }));
}
