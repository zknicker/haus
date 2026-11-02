import { Label, ListBox, Select, Separator } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { useColorThemeDefinition } from '../../../hooks/shell/use-color-theme.ts';
import { selectRooflineSnow, useRooflineSnow } from '../../../hooks/shell/use-roofline-snow.ts';
import { parseRooflineSnow, type RooflineSnow, rooflineSnows } from '../../../lib/roofline-snow.ts';

/**
 * The snow on the roofline, offered only while the theme's scene is the snowy
 * roofline. Applies instantly.
 */
export function SnowRow() {
    const { scene } = useColorThemeDefinition();
    const snow = useRooflineSnow();
    return <SnowField snow={scene === 'snowy-roofline' ? snow : null} />;
}

/**
 * The row for a given snow; nothing while the theme has no roofline. It
 * always follows the Theme row, so it brings its own divider.
 */
export function SnowField({ snow }: { snow: RooflineSnow | null }) {
    if (!snow) {
        return null;
    }
    return (
        <>
            <Separator />
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
        </>
    );
}

/** The Select's change handler: ignores anything that is not a snow. */
export function applyRooflineSnow(value: unknown) {
    const next = parseRooflineSnow(value);
    if (next) {
        selectRooflineSnow(next);
    }
}
