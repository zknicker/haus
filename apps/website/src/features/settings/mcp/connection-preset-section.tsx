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
import { useConnectionPresetIcons } from '../../../hooks/servers/use-connection-preset-icons.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import { useSkoolConnect } from '../../../hooks/servers/use-skool-connect.ts';
import { SettingsCardGrid, SettingsGridItem } from '../layout/settings-card-grid.tsx';
import { ConnectionGlyph } from './connection-mark.tsx';
import { connectionPresets, recommendedPresets } from './connection-presets.ts';
import { McpBearerTokenDialog } from './mcp-bearer-token-dialog.tsx';
import { SkoolConnectDialog } from './skool-connect-dialog.tsx';

/** Presets not yet added, each one press away from being an Added MCP. */
export function ConnectionPresetSection({ serverId }: { serverId: string }) {
    const addPreset = useConnectionPresetAdd(serverId);
    const connections = useConnections(serverId);
    const presetIcons = useConnectionPresetIcons(serverId);
    // A bearer-token preset takes its token before it is added, not after.
    const [tokenPreset, setTokenPreset] = useState<McpBearerTokenPreset | null>(null);
    const [skoolOpen, setSkoolOpen] = useState(false);
    const skool = useSkoolConnect(serverId);
    const availablePresets = recommendedPresets(connections.data ?? []);

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
                        <ItemCard.Icon>
                            <ConnectionGlyph
                                connection={{
                                    icon:
                                        presetIcons.data?.find(
                                            (entry) => entry.preset === preset.id
                                        )?.icon ??
                                        mcpPresetIcons[preset.id] ??
                                        null,
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
                            <PresetAddButton
                                isDisabled={addPreset.isPending || skool.connecting}
                                isPending={
                                    addPreset.isPending && addPreset.variables?.preset === preset.id
                                }
                                name={preset.name}
                                onPress={() => add(preset.id, preset.name)}
                            />
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

function PresetAddButton({
    isDisabled,
    isPending,
    name,
    onPress,
}: {
    isDisabled: boolean;
    isPending: boolean;
    name: string;
    onPress: () => void;
}) {
    return (
        <Tooltip delay={0}>
            <Button
                aria-label={`Add ${name}`}
                isDisabled={isDisabled}
                isIconOnly
                isPending={isPending}
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
            </Button>
            <Tooltip.Content>Add {name}</Tooltip.Content>
        </Tooltip>
    );
}

function tokenPresetName(preset: McpBearerTokenPreset) {
    return connectionPresets.find((entry) => entry.id === preset)?.name ?? preset;
}
