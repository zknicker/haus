import type { Agent } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { useAgentHomeMove } from '../../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../../hooks/projects/use-projects.ts';
import { agentHomeProject } from '../../../lib/project-homes.ts';
import { ProjectSelect } from '../../chats/project-select.tsx';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';

export function AgentHomeProjectRow({ agent }: { agent: Agent }) {
    const projects = useProjects(agent.serverId);
    const move = useAgentHomeMove();
    const home = agentHomeProject(projects.data ?? [], agent.id);

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Project</ItemCard.Title>
                <SettingsRowError>
                    {move.error?.message ?? projects.error?.message}
                </SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                <ProjectSelect
                    aria-label="Project"
                    className="w-56"
                    isDisabled={!projects.data || move.isPending}
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
    );
}
