import { type McpPreset, presetChips } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { connectionChipViews } from '../../mentions/connection-chip-views.tsx';
import { ConnectionSection } from './connection-section.tsx';

/**
 * What this connection adds to chat, each chip beside a sample drawn by the
 * real chip in a static state. The sample is inert: it shows the chip and
 * earns no tab stop. Connections that add no chip render nothing.
 */
export function ConnectionChipsSection({ preset }: { preset: McpPreset | null }) {
    const chips = presetChips(preset);
    if (chips.length === 0) {
        return null;
    }

    return (
        <ConnectionSection title="In Chat">
            <ItemCardGroup variant="outline">
                {chips.map(({ description, kind, title }) => {
                    const { Sample } = connectionChipViews[kind];
                    return (
                        <ItemCard key={kind}>
                            <ItemCard.Content>
                                <ItemCard.Title>{title}</ItemCard.Title>
                                <ItemCard.Description className="whitespace-normal">
                                    {description}
                                </ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <span className="text-base" inert>
                                    <Sample />
                                </span>
                            </ItemCard.Action>
                        </ItemCard>
                    );
                })}
            </ItemCardGroup>
        </ConnectionSection>
    );
}
