import {
    isMcpBearerTokenPreset,
    type McpBearerTokenPreset,
    type McpPreset,
    mcpPresetIcons,
} from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { ItemCard } from '@heroui-pro/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useState } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useConnectionPresetAdd } from '../../../hooks/servers/use-connection-preset-add.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import { useSkoolConnect } from '../../../hooks/servers/use-skool-connect.ts';
import { SettingsCardGrid, SettingsGridItem } from '../layout/settings-card-grid.tsx';
import { ConnectionGlyph } from './connection-mark.tsx';
import { McpBearerTokenDialog } from './mcp-bearer-token-dialog.tsx';
import { SkoolConnectDialog } from './skool-connect-dialog.tsx';

const presets: Array<{ description: string; id: McpPreset; name: string }> = [
    {
        description: 'Explore crypto prices, DEX pools, and token charts. Free, no API key.',
        id: 'coingecko',
        name: 'CoinGecko',
    },
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
    {
        description: 'Work with repositories, issues, and pull requests.',
        id: 'github',
        name: 'GitHub',
    },
    {
        description: 'Search and read public posts on X.',
        id: 'x',
        name: 'X',
    },
    {
        description: 'Read your Skool communities, posts, and classroom courses.',
        id: 'skool',
        name: 'Skool',
    },
];

/** Presets not yet added, each one press away from being an Added MCP. */
export function ConnectionPresetSection({ serverId }: { serverId: string }) {
    const addPreset = useConnectionPresetAdd(serverId);
    const connections = useConnections(serverId);
    // A bearer-token preset takes its token before it is added, not after.
    const [tokenPreset, setTokenPreset] = useState<McpBearerTokenPreset | null>(null);
    const [skoolOpen, setSkoolOpen] = useState(false);
    const skool = useSkoolConnect(serverId);
    const availablePresets = presets.filter(
        (preset) => !connections.data?.some((connection) => connection.preset === preset.id)
    );

    if (!connections.data || availablePresets.length === 0) {
        return null;
    }

    const add = (preset: McpPreset, name: string) => {
        if (preset === 'skool') {
            setSkoolOpen(true);
        } else if (isMcpBearerTokenPreset(preset)) {
            setTokenPreset(preset);
        } else {
            addPreset.mutate({ name, preset, serverId });
        }
    };

    return (
        <>
            <SettingsCardGrid count={availablePresets.length} title="Recommended">
                {availablePresets.map((preset) => (
                    <SettingsGridItem key={preset.id}>
                        {/* A preset is an MCP server like any Added row, so it
                        draws its mark the same way — from the bundled art
                        Server also falls back to. */}
                        <ItemCard.Icon>
                            <ConnectionGlyph
                                connection={{
                                    icon: mcpPresetIcons[preset.id],
                                    id: preset.id,
                                    name: preset.name,
                                }}
                            />
                        </ItemCard.Icon>
                        <ItemCard.Content>
                            <ItemCard.Title>{preset.name}</ItemCard.Title>
                            {/* `max-w-full`: the stock description is
                            `width:fit-content`, which a nowrap line grows past
                            its column instead of ellipsizing. */}
                            <ItemCard.Description className="max-w-full">
                                {preset.description}
                            </ItemCard.Description>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <Tooltip delay={0}>
                                <Button
                                    aria-label={`Add ${preset.name}`}
                                    isDisabled={addPreset.isPending || skool.connecting}
                                    isIconOnly
                                    isPending={
                                        addPreset.isPending &&
                                        addPreset.variables?.preset === preset.id
                                    }
                                    onPress={() => add(preset.id, preset.name)}
                                    size="sm"
                                    variant="ghost"
                                >
                                    <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
                                </Button>
                                <Tooltip.Content>Add {preset.name}</Tooltip.Content>
                            </Tooltip>
                        </ItemCard.Action>
                    </SettingsGridItem>
                ))}
            </SettingsCardGrid>
            {tokenPreset ? (
                <McpBearerTokenDialog
                    heading={`Connect ${tokenPresetName(tokenPreset)}`}
                    onOpenChange={(open) => !open && setTokenPreset(null)}
                    onSave={async (bearerToken) => {
                        await addPreset.mutateAsync({
                            bearerToken,
                            name: tokenPresetName(tokenPreset),
                            preset: tokenPreset,
                            serverId,
                        });
                        setTokenPreset(null);
                    }}
                    open
                    preset={tokenPreset}
                />
            ) : null}
            {skoolOpen ? (
                <SkoolConnectDialog
                    onClose={() => setSkoolOpen(false)}
                    onConnect={() => {
                        setSkoolOpen(false);
                        void skool.connect();
                    }}
                />
            ) : null}
        </>
    );
}

function tokenPresetName(preset: McpBearerTokenPreset) {
    return presets.find((entry) => entry.id === preset)?.name ?? preset;
}
