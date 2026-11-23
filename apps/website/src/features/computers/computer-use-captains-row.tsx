import type { ComputerUseAgents } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { useSetComputerUseAgents } from '../../hooks/computer-use/use-computer-use-agents.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import {
    allCaptainsKey,
    computerUseAgentKeys,
    computerUseAgentsSummary,
    computerUseAgentsValue,
    computerUseCaptains,
    nextComputerUseAgents,
} from './computer-use-model.ts';

export function ComputerUseCaptainsRow({
    agents,
    canChange,
    computerId,
    grantedAgentIds,
    serverId,
}: {
    agents: ComputerUseAgents;
    canChange: boolean;
    computerId: string;
    grantedAgentIds: readonly string[];
    serverId: string;
}) {
    const allAgents = useAgents(serverId);
    const captains = computerUseCaptains(allAgents.data ?? [], computerId, grantedAgentIds);
    const setAgents = useSetComputerUseAgents(serverId);
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={computerUseAgentsSummary(agents, captains)}>
                    Captains
                </SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                {captains.length === 0 ? (
                    <SettingsFact>No Captains can use this device</SettingsFact>
                ) : (
                    <Select
                        aria-label="Captains allowed to use computer use"
                        isDisabled={!canChange || setAgents.isPending}
                        onChange={(keys) => {
                            const next = nextComputerUseAgents(
                                agents,
                                (keys as string[]).map(String)
                            );
                            if (next) {
                                withSaveErrorToast(() =>
                                    setAgents.mutateAsync({ agents: next, computerId, serverId })
                                ).catch(() => undefined);
                            }
                        }}
                        selectionMode="multiple"
                        value={computerUseAgentKeys(agents)}
                        variant="secondary"
                    >
                        <Select.Trigger>
                            <Select.Value>
                                {() => computerUseAgentsValue(agents, captains)}
                            </Select.Value>
                            <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover placement="bottom end">
                            <ListBox selectionMode="multiple">
                                <ListBox.Item id={allCaptainsKey} textValue="All Captains">
                                    <Label>All Captains</Label>
                                    <ListBox.ItemIndicator />
                                </ListBox.Item>
                                {captains.map((captain) => (
                                    <ListBox.Item
                                        id={captain.id}
                                        key={captain.id}
                                        textValue={captain.displayName}
                                    >
                                        <Label>{captain.displayName}</Label>
                                        <ListBox.ItemIndicator />
                                    </ListBox.Item>
                                ))}
                            </ListBox>
                        </Select.Popover>
                    </Select>
                )}
            </ItemCard.Action>
        </ItemCard>
    );
}
