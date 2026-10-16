import { Label, ListBox, Select } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import {
    type ResolvedTheme,
    type ThemePreference,
    useTheme,
} from '../../../components/theme-provider.tsx';

export const modeOptions: Array<{ id: ThemePreference; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'System' },
];

/** Light, Dark, or System. Applies instantly. The first Appearance row, so no divider. */
export function ModeRow() {
    const { forcedTheme, setTheme, theme } = useTheme();
    return <ModeField forcedTheme={forcedTheme} onChange={setTheme} theme={theme} />;
}

/**
 * A color theme that pins the mode shows that mode, disabled; the stored
 * preference is untouched and returns when the theme goes back to Default.
 */
export function ModeField({
    forcedTheme,
    onChange,
    theme,
}: {
    forcedTheme: ResolvedTheme | null;
    onChange: (theme: ThemePreference) => void;
    theme: ThemePreference;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Mode</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <Select
                    aria-label="Mode"
                    className="w-40"
                    isDisabled={forcedTheme !== null}
                    onChange={(value) => onChange(value as ThemePreference)}
                    value={forcedTheme ?? theme}
                    variant="secondary"
                >
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            {modeOptions.map((option) => (
                                <ListBox.Item
                                    id={option.id}
                                    key={option.id}
                                    textValue={option.label}
                                >
                                    <Label>{option.label}</Label>
                                    <ListBox.ItemIndicator />
                                </ListBox.Item>
                            ))}
                        </ListBox>
                    </Select.Popover>
                </Select>
            </ItemCard.Action>
        </ItemCard>
    );
}
