import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Switch } from '@heroui/react';
import { setShowClaimsInChat, useShowClaimsInChat } from '../../claims/show-claims-in-chat.ts';
import { HausVersionSummary } from '../../updates/haus-version-summary.tsx';
import { useHausUpdate } from '../../updates/use-haus-update.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { ColorThemeRow } from './color-theme-row.tsx';
import { LinksSection } from './links-section.tsx';
import { ModeRow } from './mode-row.tsx';
import { SnowRow } from './snow-row.tsx';
import { WindowLayoutRow } from './window-layout-row.tsx';

export function PreferencesSettings() {
    const update = useHausUpdate();
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Preferences" />
            <AppearanceSection />
            <ChatSection />
            <LinksSection />
            <HausVersionSummary view={update.view} />
        </SettingsPageColumn>
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
                            Captains make claims as they work. Off, those stay on the Tasks page.
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
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
