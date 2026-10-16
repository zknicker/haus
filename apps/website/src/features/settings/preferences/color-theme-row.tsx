import { Label, ListBox, Select, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { selectColorTheme, useColorTheme } from '../../../hooks/shell/use-color-theme.ts';
import { parseColorTheme } from '../../../lib/color-theme.ts';
import { colorThemes } from '../../../lib/color-themes.ts';

/**
 * The palette family layered over the mode. Applies instantly. It always
 * follows the Mode row, so it brings its own divider.
 */
export function ColorThemeRow() {
    const theme = useColorTheme();
    return (
        <>
            <Separator />
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Theme</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Select
                        aria-label="Theme"
                        className="w-40"
                        onChange={applyColorTheme}
                        value={theme}
                        variant="secondary"
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {colorThemes.map((option) => (
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
        </>
    );
}

/** The Select's change handler: ignores anything that is not a color theme. */
export function applyColorTheme(value: unknown) {
    const next = parseColorTheme(value);
    if (next) {
        selectColorTheme(next);
    }
}
