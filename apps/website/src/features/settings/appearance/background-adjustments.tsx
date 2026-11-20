import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { saveThemeBackground } from '../../../hooks/shell/use-theme-background.ts';
import type { ColorTheme } from '../../../lib/color-theme.ts';
import {
    backgroundAdjustments,
    backgroundEffects,
    parseBackgroundEffect,
    type ThemeBackground,
} from '../../../lib/home-background.ts';
import { AdjustmentSlider } from './adjustment-slider.tsx';

export function BackgroundAdjustments({
    background,
    theme,
}: {
    background: ThemeBackground;
    theme: ColorTheme;
}) {
    return (
        <div className="grid gap-2">
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Effect</ItemCard.Title>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Select
                            aria-label="Background effect"
                            className="w-48"
                            onChange={(value) => {
                                const effect = parseBackgroundEffect(value);
                                if (effect) {
                                    saveThemeBackground(theme, { ...background, effect });
                                }
                            }}
                            value={background.effect}
                            variant="secondary"
                        >
                            <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    {backgroundEffects.map((effect) => (
                                        <ListBox.Item
                                            id={effect.id}
                                            key={effect.id}
                                            textValue={effect.label}
                                        >
                                            <Label>{effect.label}</Label>
                                            <ListBox.ItemIndicator />
                                        </ListBox.Item>
                                    ))}
                                </ListBox>
                            </Select.Popover>
                        </Select>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
            <div className="grid gap-2 sm:grid-cols-2">
                {backgroundAdjustments.map((adjustment) => (
                    <AdjustmentSlider
                        adjustment={adjustment}
                        background={background}
                        key={adjustment.id}
                        theme={theme}
                    />
                ))}
            </div>
        </div>
    );
}
