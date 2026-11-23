import { ItemCard } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import {
    type OpenLinksIn,
    openLinksInOptions,
    parseOpenLinksIn,
    setOpenLinksIn,
} from '../../../hooks/browser/open-links-preference.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';

export function OpenLinksInRow({ value }: { value: OpenLinksIn }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info="Web links in chats, chips, and Haus pages. Links inside a web page stay in Haus.">
                    Open links in
                </SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <Select
                    aria-label="Open links in"
                    className="w-48"
                    onChange={applyOpenLinksIn}
                    value={value}
                    variant="secondary"
                >
                    <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                        <ListBox>
                            {openLinksInOptions.map((option) => (
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

export function applyOpenLinksIn(value: unknown) {
    const next = parseOpenLinksIn(value);
    if (next) {
        setOpenLinksIn(next);
    }
}
