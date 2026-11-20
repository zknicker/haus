import type { Agent } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Label, ListBox, Select } from '@heroui/react';
import { useAgentHomeMove } from '../../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { useChatNavigationLayout } from '../../../hooks/servers/use-chats.ts';
import { agentHomeProject } from '../../../lib/project-homes.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';

export function AgentHomeProject({ agent }: { agent: Agent }) {
    const projects = useProjects(agent.serverId);
    const { channelIds } = useChatNavigationLayout(agent.serverId);
    const move = useAgentHomeMove();
    const home = agentHomeProject(projects.data ?? [], agent.id);
    const choices = (projects.data ?? []).filter(
        (project) => project === home || channelIds.includes(project.chatId)
    );

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Home</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Home Project</ItemCard.Title>
                        <SettingsRowError>
                            {move.error?.message ?? projects.error?.message}
                        </SettingsRowError>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <Select
                            aria-label="Home Project"
                            className="w-48"
                            isDisabled={!home || move.isPending}
                            onChange={(projectId) => {
                                if (typeof projectId === 'string' && projectId !== home?.chatId) {
                                    move.mutate({
                                        agentId: agent.id,
                                        projectId,
                                        serverId: agent.serverId,
                                    });
                                }
                            }}
                            value={home?.chatId ?? null}
                            variant="secondary"
                        >
                            <Select.Trigger>
                                <Select.Value />
                                <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                                <ListBox>
                                    {choices.map((project) => (
                                        <ListBox.Item
                                            id={project.chatId}
                                            key={project.chatId}
                                            textValue={`#${project.name}`}
                                        >
                                            <Label>#{project.name}</Label>
                                            <ListBox.ItemIndicator />
                                        </ListBox.Item>
                                    ))}
                                </ListBox>
                            </Select.Popover>
                        </Select>
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
