import { ItemCard, RadioButtonGroup } from '@heroui-pro/react';
import { Label } from '@heroui/react';
import {
    type ResolvedTheme,
    type ThemePreference,
    useTheme,
} from '../../../components/theme-provider.tsx';
import { useColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import { ThemePreview } from './theme-preview.tsx';

export const modeOptions: ReadonlyArray<{ id: ThemePreference; label: string }> = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
];

export function ModeRow() {
    const { forcedTheme, setTheme, theme } = useTheme();
    return (
        <ModeField
            colorTheme={useColorTheme()}
            forcedTheme={forcedTheme}
            onChange={setTheme}
            theme={theme}
        />
    );
}

export function ModeField({
    colorTheme,
    forcedTheme,
    onChange,
    theme,
}: {
    colorTheme: ColorTheme;
    forcedTheme: ResolvedTheme | null;
    onChange: (theme: ThemePreference) => void;
    theme: ThemePreference;
}) {
    const previewTheme = forcedTheme ? 'default' : colorTheme;
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Mode</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <RadioButtonGroup
                    aria-label="Mode"
                    className="theme-gallery w-64 grid-cols-3"
                    isDisabled={forcedTheme !== null}
                    layout="grid"
                    onChange={(value) => onChange(parseModeOption(value) ?? theme)}
                    value={forcedTheme ?? theme}
                >
                    {modeOptions.map((option) => (
                        <RadioButtonGroup.Item key={option.id} value={option.id}>
                            <RadioButtonGroup.ItemContent>
                                <ThemePreview mode={option.id} theme={previewTheme} />
                                <Label>{option.label}</Label>
                            </RadioButtonGroup.ItemContent>
                        </RadioButtonGroup.Item>
                    ))}
                </RadioButtonGroup>
            </ItemCard.Action>
        </ItemCard>
    );
}

function parseModeOption(value: string) {
    return modeOptions.find((option) => option.id === value)?.id ?? null;
}
