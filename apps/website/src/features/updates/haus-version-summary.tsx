import { ItemCard } from '@heroui-pro/react';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import type { HausUpdateView } from './haus-update-model.ts';

export function HausVersionRow({ view }: { view: HausUpdateView }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Version</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <SettingsFact>Haus {view.version}</SettingsFact>
            </ItemCard.Action>
        </ItemCard>
    );
}
