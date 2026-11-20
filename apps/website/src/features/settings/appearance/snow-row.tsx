import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { useColorThemeDefinition } from '../../../hooks/shell/use-color-theme.ts';
import { selectRooflineSnow, useRooflineSnow } from '../../../hooks/shell/use-roofline-snow.ts';
import { parseRooflineSnow, type RooflineSnow, rooflineSnows } from '../../../lib/roofline-snow.ts';

export function SnowRow() {
    const { scene } = useColorThemeDefinition();
    const snow = useRooflineSnow();
    return <SnowField snow={scene === 'snowy-roofline' ? snow : null} />;
}

export function SnowField({ snow }: { snow: RooflineSnow | null }) {
    if (!snow) {
        return null;
    }
    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Snow</ItemCard.Title>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Select
                        aria-label="Snow"
                        className="w-48"
                        onChange={applyRooflineSnow}
                        value={snow}
                        variant="secondary"
                    >
                        <Select.Trigger>
                            <Select.Value />
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                            <ListBox>
                                {rooflineSnows.map((option) => (
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
        </ItemCardGroup>
    );
}

export function applyRooflineSnow(value: unknown) {
    const next = parseRooflineSnow(value);
    if (next) {
        selectRooflineSnow(next);
    }
}
