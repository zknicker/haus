import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import {
    type OpenLinksIn,
    openLinksInOptions,
    parseOpenLinksIn,
    setOpenLinksIn,
    useOpenLinksIn,
} from '../../../hooks/browser/open-links-preference.ts';
import { useIsDesktopApp } from '../../../hooks/shell/use-is-desktop-app.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';

export function LinksSection() {
    const desktop = useIsDesktopApp();
    const value = useOpenLinksIn();
    return desktop ? <LinksGroup value={value} /> : null;
}

export function LinksGroup({ value }: { value: OpenLinksIn }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Links</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
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
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

export function applyOpenLinksIn(value: unknown) {
    const next = parseOpenLinksIn(value);
    if (next) {
        setOpenLinksIn(next);
    }
}
