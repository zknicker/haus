import { Switch } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useServerIdleCompaction } from '../../../hooks/servers/use-server-idle-compaction.ts';
import { SettingsRowTitle } from '../layout/settings-row-title.tsx';

/**
 * Server-wide Agent settings. Every member sees them; only an Owner flips them. The switch
 * stays blank until the setting loads, so it never shows a guessed state.
 */
export function AgentSettingsGroup({ isOwner, serverId }: { isOwner: boolean; serverId: string }) {
    const idleCompaction = useServerIdleCompaction(serverId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Agents</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">
                <ItemCard>
                    <ItemCard.Content>
                        <SettingsRowTitle info="Before an idle Claude Code session's one-hour prompt cache expires, compact it so the next turn resumes from a summary instead of the full history.">
                            Idle compaction
                        </SettingsRowTitle>
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
