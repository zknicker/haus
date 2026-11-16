import { Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { setShowClaimsInChat, useShowClaimsInChat } from '../../claims/show-claims-in-chat.ts';
import { PageColumn } from '../../shell/page-column.tsx';
import { setShowOpenThreads, useShowOpenThreads } from '../../threads/show-open-threads.ts';
import { HausVersionSummary } from '../../updates/haus-version-summary.tsx';
import { useHausUpdate } from '../../updates/use-haus-update.ts';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ColorThemeRow } from './color-theme-row.tsx';
import { ModeRow } from './mode-row.tsx';
import { NotificationsSection } from './notifications-section.tsx';
import { SnowRow } from './snow-row.tsx';
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
                <SnowRow />
                <WindowLayoutRow />
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function ChatSection() {
    const showClaimsInChat = useShowClaimsInChat();
    const showOpenThreads = useShowOpenThreads();

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Chat</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Show claims in chat</ItemCard.Title>
                        <ItemCard.Description>
                            Agents make claims as they work. Off, those stay on the Tasks page.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Switch
                            aria-label="Show claims in chat"
                            isSelected={showClaimsInChat}
                            onChange={setShowClaimsInChat}
                        >
                            <Switch.Content>
                                <Switch.Control>
                                    <Switch.Thumb />
                                </Switch.Control>
                            </Switch.Content>
                        </Switch>
                    </ItemCard.Action>
                </ItemCard>
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Show open threads</ItemCard.Title>
                        <ItemCard.Description>
                            Lists Threads still in motion in the sidebar.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Switch
                            aria-label="Show open threads"
                            isSelected={showOpenThreads}
                            onChange={setShowOpenThreads}
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
