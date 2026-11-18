import { ItemCardGroup } from '@heroui-pro/react';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { PageColumn } from '../shell/page-column.tsx';

export function ComputerProfilePending() {
    return (
        <PageColumn>
            <SettingsPageHeader title="Computer" />
            {[
                'Runtimes',
                'Browser',
                'Cloud Agents',
                'Agents on This Computer',
                'System Log',
                'Computer Management',
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
        </PageColumn>
    );
}
