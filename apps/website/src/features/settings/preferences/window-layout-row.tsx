import { Label, ListBox, Select } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { selectShellVariant, useShellVariant } from '../../../hooks/shell/use-shell-variant.ts';
import { parseShellVariant, type ShellVariant } from '../../../lib/shell-variant.ts';

export const windowLayoutOptions: Array<{ id: ShellVariant; label: string }> = [
    { id: 'band', label: 'Band' },
    { id: 'canvas', label: 'Canvas' },
];

/** Desktop only: how the window frames the sidebar, tabs, and content. Applies instantly. */
export function WindowLayoutRow() {
    return <WindowLayoutField variant={useShellVariant()} />;
}

/** The row for a given layout; nothing on the web, which has none. */
export function WindowLayoutField({ variant }: { variant: ShellVariant | null }) {
    if (!variant) {
        return null;
    }
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Window layout</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <Select
                    aria-label="Window layout"
                    className="w-40"
                    onChange={applyWindowLayout}
                    value={variant}
                    variant="secondary"
                >
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            {windowLayoutOptions.map((option) => (
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

/** The Select's change handler: ignores anything that is not a window layout. */
export function applyWindowLayout(value: unknown) {
    const next = parseShellVariant(value);
    if (next) {
        selectShellVariant(next);
    }
}
