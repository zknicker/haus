import type { Agent } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Description, Dropdown, Header, Label, Separator } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { ChannelIconBox } from '../../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useAgentHomeMove } from '../../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { useChatAppearances } from '../../../hooks/servers/use-chats.ts';
import { projectCaptains, projectChoices } from '../../../lib/project-homes.ts';
import { SettingsEmptyRow } from '../layout/settings-empty.tsx';
import { SettingsRowError } from '../layout/settings-text.tsx';

export function ProjectCaptainsSection({
    isDisabled,
    projectId,
    serverId,
}: {
    isDisabled: boolean;
    projectId: string;
    serverId: string;
}) {
    const projects = useProjects(serverId);
    const agents = useAgents(serverId);
    const move = useAgentHomeMove();
    const { candidates, captains } = projectCaptains(
        projects.data ?? [],
        agents.data ?? [],
        projectId
    );
    const loaded = projects.data !== undefined && agents.data !== undefined;
    const moveHome = (agentId: string, homeId: string) =>
        move.mutate({ agentId, projectId: homeId, serverId });
    if (!(loaded || projects.error || agents.error)) {
        return null;
    }

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    Captains
                    {loaded ? (
                        <>
                            <span className="sr-only"> </span>
                            <span className="text-muted ms-2 tabular-nums">{captains.length}</span>
                        </>
                    ) : null}
                </ItemCardGroup.Title>
                {isDisabled || candidates.length === 0 ? null : (
                    <Dropdown>
                        <Button isDisabled={move.isPending} size="sm" variant="secondary">
                            Add Captain
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu
                                onAction={(agentId) => moveHome(String(agentId), projectId)}
                            >
                                {candidates.map(({ agent, home }) => (
                                    <Dropdown.Item
                                        id={agent.id}
                                        key={agent.id}
                                        textValue={agent.displayName}
                                    >
                                        <EntityAvatar
                                            name={agent.displayName}
                                            size="sm"
                                            src={agent.avatarUrl}
                                        />
                                        <div className="flex flex-col">
                                            <Label>{agent.displayName}</Label>
                                            <Description>Lives in #{home.name}</Description>
                                        </div>
                                    </Dropdown.Item>
                                ))}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                )}
            </ItemCardGroup.Header>
            {loaded ? (
                <ItemCardGroup>
                    {captains.length === 0 ? (
                        <SettingsEmptyRow>No Captains live here.</SettingsEmptyRow>
                    ) : null}
                    {captains.map((agent, index) => (
                        <React.Fragment key={agent.id}>
                            {index > 0 ? <Separator /> : null}
                            <ItemCard>
                                <EntityAvatar
                                    name={agent.displayName}
                                    size={rowMarkSize}
                                    src={agent.avatarUrl}
                                />
                                <ItemCard.Content>
                                    <ItemCard.Title>{agent.displayName}</ItemCard.Title>
                                </ItemCard.Content>
                                {isDisabled ? null : (
                                    <ItemCard.Action>
                                        <CaptainMenu
                                            agent={agent}
                                            isPending={move.isPending}
                                            onMove={(homeId) => moveHome(agent.id, homeId)}
                                            projectId={projectId}
                                            serverId={serverId}
                                        />
                                    </ItemCard.Action>
                                )}
                            </ItemCard>
                        </React.Fragment>
                    ))}
                </ItemCardGroup>
            ) : null}
            <SettingsRowError>
                {move.error?.message ?? projects.error?.message ?? agents.error?.message}
            </SettingsRowError>
        </ItemCardGroup>
    );
}

function CaptainMenu({
    agent,
    isPending,
    onMove,
    projectId,
    serverId,
}: {
    agent: Agent;
    isPending: boolean;
    onMove: (projectId: string) => void;
    projectId: string;
    serverId: string;
}) {
    const projects = useProjects(serverId).data ?? [];
    const chats = useChatAppearances(serverId);
    const choices = projectChoices(projects, chats, projectId);
    if (choices.length === 0) {
        return null;
    }

    return (
        <Dropdown>
            <Button
                aria-label={`${agent.displayName} actions`}
                isDisabled={isPending}
                isIconOnly
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu onAction={(homeId) => onMove(String(homeId))}>
                    <Dropdown.Section>
                        <Header>Move to</Header>
                        {choices.map((choice) => (
                            <Dropdown.Item
                                id={choice.chatId}
                                key={choice.chatId}
                                textValue={choice.name}
                            >
                                <ChannelIconBox
                                    color={choice.color}
                                    icon={choice.icon}
                                    size="inline"
                                />
                                <Label>#{choice.name}</Label>
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Section>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}

const rowMarkSize = 33.75;
