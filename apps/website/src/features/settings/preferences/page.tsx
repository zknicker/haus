import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator, Switch } from '@heroui/react';
import { Fragment } from 'react';
import { useOpenLinksIn } from '../../../hooks/browser/open-links-preference.ts';
import { useIsDesktopApp } from '../../../hooks/shell/use-is-desktop-app.ts';
import { useShellVariant } from '../../../hooks/shell/use-shell-variant.ts';
import { setShowClaimsInChat, useShowClaimsInChat } from '../../claims/show-claims-in-chat.ts';
import { HausVersionRow } from '../../updates/haus-version-summary.tsx';
import { useHausUpdate } from '../../updates/use-haus-update.ts';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { OpenLinksInRow } from './links-section.tsx';
import { WindowLayoutField } from './window-layout-row.tsx';

export function PreferencesSettings() {
    const update = useHausUpdate();
    const variant = useShellVariant();
    const desktop = useIsDesktopApp();
    const openLinksIn = useOpenLinksIn();
    const rows = [
        variant ? { id: 'window', row: <WindowLayoutField variant={variant} /> } : null,
        { id: 'claims', row: <ShowClaimsRow /> },
        desktop ? { id: 'links', row: <OpenLinksInRow value={openLinksIn} /> } : null,
        { id: 'version', row: <HausVersionRow view={update.view} /> },
    ].filter((entry) => entry !== null);

    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Preferences" />
            <ItemCardGroup>
                {rows.map(({ id, row }, index) => (
                    <Fragment key={id}>
                        {index > 0 ? <Separator /> : null}
                        {row}
                    </Fragment>
                ))}
            </ItemCardGroup>
        </SettingsPageColumn>
    );
}

function ShowClaimsRow() {
    const showClaimsInChat = useShowClaimsInChat();

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Show claims in chat</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    Shows Captains’ claims in chat, not only on the Tasks page.
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
    );
}
