import type { Agent } from '@haus/api';
import { Chip, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { availabilityBadgeColor } from '../agent-avatar.tsx';

/** Agents created by one human, with its own focused list read. */
export function CreatedAgents({
    agentHref,
    serverId,
    userId,
}: {
    agentHref: (agentId: string) => string;
    serverId: string;
    userId: string;
}) {
    const agents = useAgents(serverId);
    const created = (agents.data ?? []).filter((agent) => agent.createdByUserId === userId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>
                    Created Agents
                    {agents.data ? (
                        <span className="ms-2 text-muted tabular-nums">{created.length}</span>
                    ) : null}
                </ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {/* Blank while loading — the app shows no skeletons on synced surfaces. */}
            {!agents.data && agents.isPending ? (
                <div aria-busy="true" className="min-h-24">
                    <span className="sr-only">Loading created Agents</span>
                </div>
            ) : (
                <ItemCardGroup className="overflow-hidden">
                    {created.length === 0 ? (
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Description>
                                    {agents.error && !agents.data
                                        ? 'Unable to load created Agents.'
                                        : 'No Agents created by this human yet.'}
                                </ItemCard.Description>
                            </ItemCard.Content>
                        </ItemCard>
                    ) : (
                        created.map((agent, index) => (
                            <React.Fragment key={agent.id}>
                                {index > 0 ? <Separator /> : null}
                                <CreatedAgentRow agent={agent} href={agentHref(agent.id)} />
                            </React.Fragment>
                        ))
                    )}
                </ItemCardGroup>
            )}
        </ItemCardGroup>
    );
}

function CreatedAgentRow({ agent, href }: { agent: Agent; href: string }) {
    const navigate = useNavigate();

    return (
        <ItemCard<'button'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => navigate(href)}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Icon className="bg-transparent">
                <EntityAvatar name={agent.displayName} size="sm" src={agent.avatarUrl} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title>{agent.displayName}</ItemCard.Title>
            </ItemCard.Content>
            <ItemCard.Action>
                <Chip
                    className="capitalize"
                    color={availabilityBadgeColor(agent.availability)}
                    size="sm"
                    variant="soft"
                >
                    {agent.availability}
                </Chip>
            </ItemCard.Action>
        </ItemCard>
    );
}
