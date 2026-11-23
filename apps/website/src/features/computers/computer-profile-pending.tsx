import { ItemCardGroup } from '@heroui-pro/react';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';

export function ComputerProfilePending() {
    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Device" />

            {[
                'Access',
                'Repositories',
                'Plan usage',
                'Browser',
                'Cloud Agents',
                'Captains on this device',
                'Updates',
            ].map((title) => (
                <section key={title}>
                    <ItemCardGroup variant="transparent">
                        <ItemCardGroup.Header>
                            <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
                        </ItemCardGroup.Header>
                        <div aria-busy="true" className="min-h-24">
                            <span className="sr-only">Loading {title}</span>
                        </div>
                    </ItemCardGroup>
                </section>
            ))}
        </SettingsPageColumn>
    );
}
