import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { NotificationsSection } from './notifications-section.tsx';

export function NotificationsSettings() {
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Notifications" />
            <NotificationsSection />
        </SettingsPageColumn>
    );
}
