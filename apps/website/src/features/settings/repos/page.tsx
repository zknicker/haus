import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';

export function ReposSettings() {
    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Repositories" />
        </SettingsPageColumn>
    );
}
