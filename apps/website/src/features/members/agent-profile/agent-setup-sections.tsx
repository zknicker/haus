import type { Agent } from '@haus/api';
import { ItemCardGroup } from '@heroui-pro/react';
import type * as React from 'react';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import { useConnections } from '../../../hooks/servers/use-connections.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { AgentTools as AgentConnections } from '../../../routes/app/agent-tools.tsx';
import { AgentMachineRow } from './agent-machine-row.tsx';
import { AgentPermissions } from './agent-permissions.tsx';
import { AgentRuntime } from './agent-runtime.tsx';
import { canOpenAgentSection } from './agent-sections.ts';
import { AgentSkills } from './agent-skills.tsx';
import { ProfileListSection } from './profile-list-section.tsx';

/**
 * The configuration drill-downs. Each owns its query and keeps its heading
 * while that query loads or fails, so a slow Computer never blanks the page.
 */

/** Runs on: the Captain's Machine, then the model it runs. */
export function AgentRuntimeSection({ agent, server }: { agent: Agent; server: ServerDetail }) {
    const computers = useComputers(server.id);
    const computer = computers.data?.find((candidate) => candidate.id === agent.computerId);
    const canEdit = server.role === 'owner' || server.role === 'admin';

    return (
        <>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup className="overflow-hidden">
                    <AgentMachineRow agent={agent} canEdit={canEdit} />
                </ItemCardGroup>
            </ItemCardGroup>
            <AgentRuntime
                agent={agent}
                canEdit={canEdit}
                computerHealth={computer?.health}
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

/**
 * What this Agent may manage for other Agents. The route already sends a
 * Member home (`canOpenAgentSection`); this check keeps the switches absent
 * should the page ever render for one anyway.
 */
export function AgentPermissionsSection({ agent, server }: { agent: Agent; server: ServerDetail }) {
    return (
        <AgentPermissions
            agent={agent}
            canManage={canOpenAgentSection('permissions', server.role)}
            serverId={server.id}
        />
    );
}

/** A section that keeps its heading while its list is loading or unavailable. */
function SectionShell({ children, title }: { children: React.ReactNode; title: string }) {
    return <ProfileListSection title={title}>{children}</ProfileListSection>;
}

function SectionError({ message }: { message: string }) {
    return (
        <p className="text-danger px-4 py-3 text-sm" role="alert">
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
