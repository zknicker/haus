import type { ComputerUseAgents } from '@haus/api';
import { InlineSelect, ItemCard } from '@heroui-pro/react';
import { Label, ListBox } from '@heroui/react';
import { useSetComputerUseAgents } from '../../hooks/computer-use/use-computer-use-agents.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import {
    allCaptainsKey,
    computerUseAgentKeys,
    computerUseAgentsSummary,
    nextComputerUseAgents,
} from './computer-use-model.ts';

export function ComputerUseCaptainsRow({
    agents,
    canChange,
    computerId,
    serverId,
}: {
    agents: ComputerUseAgents;
    canChange: boolean;
    computerId: string;
    serverId: string;
}) {
    const allAgents = useAgents(serverId);
    const captains = (allAgents.data ?? []).filter((agent) => agent.computerId === computerId);
    const setAgents = useSetComputerUseAgents(serverId);
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Captains</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    {computerUseAgentsSummary(agents, captains)}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <InlineSelect
                    aria-label="Captains allowed to use computer use"
                    isDisabled={!canChange || captains.length === 0 || setAgents.isPending}
                    onChange={(keys) => {
                        const next = nextComputerUseAgents(agents, (keys as string[]).map(String));
                        if (next) {
                            withSaveErrorToast(() =>
                                setAgents.mutateAsync({ agents: next, computerId, serverId })
                            ).catch(() => undefined);
                        }
                    }}
                    selectionMode="multiple"
                    value={computerUseAgentKeys(agents)}
                >
                    <InlineSelect.Trigger>
                        <InlineSelect.Value>
                            {() => (agents.kind === 'all' ? 'All Captains' : 'Only some')}
                        </InlineSelect.Value>
                        <InlineSelect.Indicator />
                    </InlineSelect.Trigger>
                    <InlineSelect.Popover className="w-64" placement="bottom end">
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
                    </InlineSelect.Popover>
                </InlineSelect>
            </ItemCard.Action>
        </ItemCard>
    );
}
