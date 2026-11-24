import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Switch } from '@heroui/react';
import { useServerIdleCompaction } from '../../../hooks/servers/use-server-idle-compaction.ts';

/**
 * Server-wide Agent settings. Every member sees them; only an Owner flips them. The switch
 * stays blank until the setting loads, so it never shows a guessed state.
 */
export function AgentSettingsGroup({ isOwner, serverId }: { isOwner: boolean; serverId: string }) {
    const idleCompaction = useServerIdleCompaction(serverId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Captains</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Idle compaction</ItemCard.Title>
                        <ItemCard.Description className="whitespace-normal">
                            Summarizes an idle Claude Code session before its prompt cache expires.
                        </ItemCard.Description>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        {idleCompaction.enabled === null ? null : (
                            <Switch
                                aria-label="Idle compaction"
                                isDisabled={!isOwner || idleCompaction.isPending}
                                isSelected={idleCompaction.enabled}
                                onChange={(selected) => idleCompaction.setEnabled(selected)}
                            >
                                <Switch.Content>
                                    <Switch.Control>
                                        <Switch.Thumb />
                                    </Switch.Control>
                                </Switch.Content>
                            </Switch>
                        )}
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
