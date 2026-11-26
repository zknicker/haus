import type { Agent } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import * as React from 'react';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { SettingsFact } from '../../settings/layout/settings-text.tsx';
import { AgentHomeProjectRow } from './agent-home-project.tsx';
import { ProfileListSection } from './profile-list-section.tsx';

/**
 * The Agent's identity as settled facts plus its home Project. Editing the
 * name and brief lives on the profile header, where the name and the photo
 * already are, so this card states the record — including the created date,
 * which is provenance rather than identity.
 */
export function AgentProfileCard({ agent }: { agent: Agent }) {
    const creator = useAgentCreatorName(agent);
    const facts = [
        { label: 'Name', value: agent.displayName },
        { label: 'Handle', value: `@${agent.handle}` },
        { label: 'Created', value: formatCreatedAt(agent.createdAt, creator) },
    ];

    return (
        <ProfileListSection title="Profile">
            {facts.map((row, index) => (
                <React.Fragment key={row.label}>
                    {index > 0 ? <Separator /> : null}
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>{row.label}</ItemCard.Title>
                        </ItemCard.Content>
                        <ItemCard.Action>
                            <SettingsFact>{row.value}</SettingsFact>
                        </ItemCard.Action>
                    </ItemCard>
                </React.Fragment>
            ))}
            <Separator />
            {/* The brief is prose, so it reads under its label rather than
                squeezed into the trailing slot. */}
            <ItemCard>
                <ItemCard.Content>
                    <ItemCard.Title>Description</ItemCard.Title>
                    <ItemCard.Description className="whitespace-normal" data-selectable-text="">
                        {agent.description || 'No description yet.'}
                    </ItemCard.Description>
                </ItemCard.Content>
            </ItemCard>
            <Separator />
            <AgentHomeProjectRow agent={agent} />
        </ProfileListSection>
    );
}

/** The Agent's creator by name, from the Agent and member directories. */
export function useAgentCreatorName(agent: Agent): string | null {
    const agents = useAgents(agent.serverId);
    const humans = useHumanDirectory(agent.serverId);
    return agentCreatorName(agent, agents.data ?? [], humans.name);
}

/**
 * A creating Agent is named from the directory; a creating human from members.
 *
 * An Agent another Agent created has no other place that says so, and who added
 * a teammate is the fact a reader needs before trusting one they did not add
 * themselves. The creator is named, never linked: this row is provenance, and
 * the profile it would open is one the reader can already reach by name.
 */
export function agentCreatorName(
    agent: Pick<Agent, 'createdByAgentId' | 'createdByUserId'>,
    agents: readonly Agent[],
    humanName: (userId: string) => string
): string | null {
    if (agent.createdByAgentId) {
        return (
            agents.find((candidate) => candidate.id === agent.createdByAgentId)?.displayName ?? null
        );
    }
    return agent.createdByUserId ? humanName(agent.createdByUserId) : null;
}

function formatCreatedAt(value: Date | string, creator: string | null) {
    const date = formatDate(value);
    return creator ? `${date} by ${creator}` : date;
}

function formatDate(value: Date | string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}
