import type { McpPreset } from '@haus/api';
import { Button, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useConnectionPresetAdd } from '../../../hooks/servers/use-connection-preset-add.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import { ConnectionGlyph } from './connection-mark.tsx';

const presets: Array<{ description: string; id: McpPreset; name: string }> = [
    {
        description: 'Look up Amazon products and preview ASINs in messages.',
        id: 'rankwrangler',
        name: 'RankWrangler',
    },
    {
        description: 'Read and schedule events on your Google calendars.',
        id: 'google-calendar',
        name: 'Google Calendar',
    },
    {
        description: 'Query the MerchBase product catalog, designs, and sales.',
        id: 'merchbase',
        name: 'MerchBase',
    },
];

export function ConnectionPresetSection({ serverId }: { serverId: string }) {
    const addPreset = useConnectionPresetAdd(serverId);
    const connections = useConnections(serverId);
    const availablePresets = presets.filter(
        (preset) => !connections.data?.some((connection) => connection.preset === preset.id)
    );

    if (!connections.data || availablePresets.length === 0) {
        return null;
    }

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Recommended</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                {availablePresets.map((preset, index) => (
                    <Fragment key={preset.id}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard>
                            {/* A preset is an MCP server like any other row on
                                this page, so it draws its mark the same way. */}
                            <ItemCard.Icon>
                                <ConnectionGlyph
                                    connection={{
                                        icon: null,
                                        id: preset.id,
                                        name: preset.name,
                                    }}
                                />
                            </ItemCard.Icon>
                            <ItemCard.Content>
                                <ItemCard.Title>{preset.name}</ItemCard.Title>
                                <ItemCard.Description>{preset.description}</ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <Button
                                    isDisabled={addPreset.isPending}
                                    isPending={
                                        addPreset.isPending &&
                                        addPreset.variables?.preset === preset.id
                                    }
                                    onPress={() =>
                                        addPreset.mutate({
                                            name: preset.name,
                                            preset: preset.id,
                                            serverId,
                                        })
                                    }
                                    size="sm"
                                    variant="secondary"
                                >
                                    Add MCP
                                </Button>
                            </ItemCard.Action>
                        </ItemCard>
                    </Fragment>
                ))}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
