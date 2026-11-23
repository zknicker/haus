import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment } from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { availabilityBadgeColor } from '../members/agent-avatar.tsx';
import { SettingsEmptyRow } from '../settings/layout/settings-empty.tsx';
import { SettingsStatusChip, SettingsStatusTitle } from '../settings/layout/settings-row-title.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import { agentExecutionLabels, availabilityLabel } from './presentation.ts';

type Agent = HausOutputs['agent']['list'][number];

export interface HomeCaptainRow {
    availability: Agent['availability'];
    avatarUrl: string | null;
    displayName: string;
    id: string;
    model: string;
    wakePause: Agent['wakePause'];
}

export function ComputerAgents({ computerId, serverId }: { computerId: string; serverId: string }) {
    const openAgentProfile = useOpenAgentProfile();
    const agents = useAgents(serverId);
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);

    if (!computer) {
        return null;
    }

    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Captains using this device by default</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {agents.data ? (
                    <HomeCaptainList
                        onOpenAgent={openAgentProfile}
                        rows={agents.data
                            .filter((agent) => agent.computerId === computerId)
                            .map((agent) => homeCaptainRow(agent, computer.reportedInventory))}
                    />
                ) : agents.isError ? (
                    <ItemCardGroup>
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Couldn’t load Captains</ItemCard.Title>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <Button
                                    onPress={() => void agents.refetch()}
                                    size="sm"
                                    variant="secondary"
                                >
                                    Retry
                                </Button>
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                ) : null}
            </ItemCardGroup>
        </section>
    );
}

export function HomeCaptainList({
    onOpenAgent,
    rows,
}: {
    onOpenAgent: (agentId: string) => void;
    rows: readonly HomeCaptainRow[];
}) {
    return (
        <ItemCardGroup>
            {rows.length === 0 ? (
                <SettingsEmptyRow>No Captains use this device by default</SettingsEmptyRow>
            ) : (
                rows.map((row, index) => (
                    <Fragment key={row.id}>
                        {index > 0 ? <Separator /> : null}
                        <ItemCard<'button'>
                            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
                            onClick={() => onOpenAgent(row.id)}
                            render={(props) => <button type="button" {...props} />}
                        >
                            <PressableFeedback.Highlight />
                            <EntityAvatar name={row.displayName} size="sm" src={row.avatarUrl} />
                            <ItemCard.Content>
                                <SettingsStatusTitle
                                    status={
                                        <SettingsStatusChip
                                            color={availabilityBadgeColor(row.availability)}
                                        >
                                            {availabilityLabel(row)}
                                        </SettingsStatusChip>
                                    }
                                >
                                    {row.displayName}
                                </SettingsStatusTitle>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <div className="flex items-center gap-2">
                                    <SettingsFact>{row.model}</SettingsFact>
                                    <Icon
                                        aria-hidden="true"
                                        className="text-muted"
                                        icon={ArrowRight01Icon}
                                        size={16}
                                    />
                                </div>
                            </ItemCard.Action>
                        </ItemCard>
                    </Fragment>
                ))
            )}
        </ItemCardGroup>
    );
}

function homeCaptainRow(
    agent: Agent,
    inventory: HausOutputs['computer']['list'][number]['reportedInventory']
): HomeCaptainRow {
    return {
        availability: agent.availability,
        avatarUrl: agent.avatarUrl,
        displayName: agent.displayName,
        id: agent.id,
        model: agentExecutionLabels(agent, inventory).model,
        wakePause: agent.wakePause,
    };
}
