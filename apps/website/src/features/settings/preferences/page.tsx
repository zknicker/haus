import { Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { PageColumn } from '../../shell/page-column.tsx';
import { setShowTasksInChat, useShowTasksInChat } from '../../tasks/show-tasks-in-chat.ts';
import { HausVersionSummary } from '../../updates/haus-version-summary.tsx';
import { useHausUpdate } from '../../updates/use-haus-update.ts';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ColorThemeRow } from './color-theme-row.tsx';
import { ModeRow } from './mode-row.tsx';
import { NotificationsSection } from './notifications-section.tsx';
import { WindowLayoutRow } from './window-layout-row.tsx';

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
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Appearance</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ModeRow />
                <ColorThemeRow />
                <WindowLayoutRow />
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
