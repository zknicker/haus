import type { Agent } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { useAgentHomeMove } from '../../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { agentHomeProject, homeIsFixed } from '../../../lib/project-homes.ts';
import { ProjectSelect } from '../../chats/project-select.tsx';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';

export function AgentHomeProject({ agent }: { agent: Agent }) {
    const projects = useProjects(agent.serverId);
    const move = useAgentHomeMove();
    const home = agentHomeProject(projects.data ?? [], agent.id);
    const fixed = homeIsFixed(agent);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Home</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup>
                <ItemCard>
                    <ItemCard.Content>
                        <ItemCard.Title>Home Project</ItemCard.Title>
                        {fixed ? (
                            <ItemCard.Description>
                                Cove always lives in the Haus project.
                            </ItemCard.Description>
                        ) : null}
                        <SettingsRowError>
                            {move.error?.message ?? projects.error?.message}
                        </SettingsRowError>
                    </ItemCard.Content>
                    <ItemCard.Action>
                        <ProjectSelect
                            aria-label="Home Project"
                            className="w-56"
                            isDisabled={fixed || !projects.data || move.isPending}
                            onSelect={(projectId) =>
                                move.mutate({
                                    agentId: agent.id,
                                    projectId,
                                    serverId: agent.serverId,
                                })
                            }
                            serverId={agent.serverId}
                            value={home?.chatId ?? null}
                        />
                    </ItemCard.Action>
                </ItemCard>
            </ItemCardGroup>
        </ItemCardGroup>
    );
}
