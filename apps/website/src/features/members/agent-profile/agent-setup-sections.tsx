import type { Agent } from '@haus/api';
import { Button, Chip } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentTools as AgentConnections } from '../../../routes/app/agent-tools.tsx';
import {
    computerHealthColor,
    computerHealthLabel,
    computerLabel,
} from '../../computers/presentation.ts';
import { serverComputersRoute } from '../../servers/server-routes.ts';
import { AgentRuntime } from './agent-runtime.tsx';
import { AgentSkills } from './agent-skills.tsx';

/**
 * The configuration drill-downs. Each owns its query and keeps its heading
 * while that query loads or fails, so a slow Computer never blanks the page.
 */

/** Runs on: the Computer this Agent lives on, then the model it runs. */
export function AgentRuntimeSection({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const navigate = useNavigate();
    const computers = useComputers(server.id);
    const computer = computers.data?.find((candidate) => candidate.id === agent.computerId);
    const canView = server.role !== 'member';
    const canEdit = server.role === 'owner' || server.role === 'admin';

    return (
        <>
            <SectionShell title="Computer">
                {computers.error && !computers.data ? (
                    <SectionError message={computers.error.message} />
                ) : computers.data ? (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Title>
                                {computer
                                    ? computerLabel(computer)
                                    : 'Assigned Computer unavailable'}
                            </ItemCard.Title>
                        </ItemCard.Content>
                        <ItemCard.Action className="flex items-center gap-2">
                            {computer ? (
                                <Chip
                                    color={computerHealthColor(computer.health)}
                                    size="sm"
                                    variant="soft"
                                >
                                    <Chip.Label>{computerHealthLabel(computer.health)}</Chip.Label>
                                </Chip>
                            ) : null}
                            {canView ? (
                                <Button
                                    onPress={() =>
                                        navigate(
                                            `${serverComputersRoute(server.slug)}?computer=${encodeURIComponent(agent.computerId)}`
                                        )
                                    }
                                    size="sm"
                                    variant="secondary"
                                >
                                    View
                                </Button>
                            ) : null}
                        </ItemCard.Action>
                    </ItemCard>
                ) : (
                    <SectionPending label="Loading Computer" />
                )}
            </SectionShell>
            <AgentRuntime
                agent={agent}
                canEdit={canEdit}
                computerHealth={computer?.health}
                runtimes={computer?.reportedInventory?.runtimes ?? []}
                serverId={server.id}
            />
        </>
    );
}

export function AgentConnectionsSection({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const connections = useConnections(server.id);

    if (connections.data) {
        return (
            <AgentConnections agent={agent} connections={connections.data} serverId={server.id} />
        );
    }
    return (
        <SectionShell title="Connections">
            {connections.error ? (
                <SectionError message={connections.error.message} />
            ) : (
                <SectionPending label="Loading MCP connections" />
            )}
        </SectionShell>
    );
}

export function AgentSkillsSection({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const computers = useComputers(server.id);
    const inventory = computers.data?.find(
        (candidate) => candidate.id === agent.computerId
    )?.reportedInventory;

    if (computers.data) {
        return (
            <AgentSkills
                agent={agent}
                canEdit={server.role === 'owner' || server.role === 'admin'}
                imports={inventory?.agentSkillImports ?? []}
                server={server}
                skillSources={inventory?.importableSkills ?? []}
                skills={
                    inventory?.agentSkills?.find((entry) => entry.agentId === agent.id)?.skills ??
                    []
                }
            />
        );
    }
    return (
        <SectionShell title="Skills">
            {computers.error ? (
                <SectionError message={computers.error.message} />
            ) : (
                <SectionPending label="Loading Skills" />
            )}
        </SectionShell>
    );
}

/** A section that keeps its heading while its list is loading or unavailable. */
function SectionShell({ children, title }: { children: React.ReactNode; title: string }) {
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            <ItemCardGroup className="overflow-hidden">{children}</ItemCardGroup>
        </ItemCardGroup>
    );
}

function SectionError({ message }: { message: string }) {
    return (
        <p className="px-4 py-3 text-danger text-sm" role="alert">
            {message}
        </p>
    );
}

function SectionPending({ label }: { label: string }) {
    return (
        <div aria-busy="true" className="min-h-16">
            <span className="sr-only">{label}</span>
        </div>
    );
}
