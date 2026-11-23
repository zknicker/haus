import { ItemCard } from '@heroui-pro/react';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import type { HausUpdateView } from './haus-update-model.ts';

export function HausVersionRow({ view }: { view: HausUpdateView }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info="Component updates are managed from the sidebar.">
                    Version
                </SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <SettingsFact>Haus {view.version}</SettingsFact>
            </ItemCard.Action>
        </ItemCard>
    );
}
