import { Label, ListBox, Select, Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { type ThemePreference, useTheme } from '../../../components/theme-provider.tsx';
import { PageColumn } from '../../shell/page-column.tsx';
import { setShowTasksInChat, useShowTasksInChat } from '../../tasks/show-tasks-in-chat.ts';
import { HausVersionSummary } from '../../updates/haus-version-summary.tsx';
import { useHausUpdate } from '../../updates/use-haus-update.ts';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { NotificationsSection } from './notifications-section.tsx';

export function PreferencesSettings() {
    const update = useHausUpdate();
    return (
        <PageColumn>
            <SettingsPageHeader
                description="How Haus looks and behaves on this device."
                title="Preferences"
            />
            <AppearanceSection />
            <ChatSection />
            <NotificationsSection />
            <HausVersionSummary view={update.view} />
        </PageColumn>
    );
}

function AppearanceSection() {
    const { setTheme, theme } = useTheme();

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Appearance</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Theme</ItemCard.Title>
                        <ItemCard.Description>
                            Applies to Haus on this device only.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Select
                            aria-label="Theme"
                            className="w-40"
                            onChange={(value) => setTheme(value as ThemePreference)}
                            value={theme}
                            variant="secondary"
                        >
                            <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    {themeOptions.map((option) => (
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

function ChatSection() {
    const showTasksInChat = useShowTasksInChat();

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Chat</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Show tasks in chat</ItemCard.Title>
                        <ItemCard.Description>
                            Agents claim tasks as they work. Off, those stay on the Tasks page.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Switch
                            aria-label="Show tasks in chat"
                            isSelected={showTasksInChat}
                            onChange={setShowTasksInChat}
                        >
                            <Switch.Content>
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch.Content>
                        </Switch>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

const themeOptions: Array<{ id: ThemePreference; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
    { id: 'system', label: 'System' },
];
