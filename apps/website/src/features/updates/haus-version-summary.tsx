import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type { HausUpdateView } from './haus-update-model.ts';

export function HausVersionSummary({ view }: { view: HausUpdateView }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Version</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Haus {view.version}</ItemCard.Title>
                        <ItemCard.Description>
                            Component updates are managed from the sidebar.
                        </ItemCard.Description>
                    </ItemCard.Content>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
