import type { Agent, LinearIdentity } from '@haus/api';
import { Separator } from '@heroui/react';
import { useState } from 'react';
import { useLinearIdentities } from '../../../../../hooks/linear/use-linear-identities.ts';
import { useLinearIdentityDraft } from '../../../../../hooks/linear/use-linear-identity-draft.ts';
import { useLinearStartIdentityInstall } from '../../../../../hooks/linear/use-linear-start-identity-install.ts';
import { useLinearWorkspace } from '../../../../../hooks/linear/use-linear-workspace.ts';
import { useServerContext } from '../../../../servers/server-context.ts';
import type {
    AgentAccessExtender,
    AgentAccessExtension,
} from '../built-in-connection-definition.ts';
import { LinearDefaultAgentRow } from './linear-default-agent-row.tsx';
import {
    type LinearIdentityFlowMode,
    linearIdentityFlowMode,
} from './linear-identity-flow-model.ts';
import { LinearIdentityFlowPanel } from './linear-identity-flow-panel.tsx';
import {
    identityForAgent,
    type LinearIdentityAction,
    linearMemberTeams,
} from './linear-identity-model.ts';
import { LinearIdentityRemoveDialog } from './linear-identity-remove-dialog.tsx';
import { LinearIdentityLine } from './linear-identity-row.tsx';
import { LinearSetupDisclosure } from './linear-setup-motion.tsx';
import { linearApplicationsSettingsUrl } from './linear-workspace-health.ts';
import {
    rememberLinearIdentityInstall,
    useLinearIdentityArrival,
} from './use-linear-identity-arrival.ts';

const identityExplainer =
    'Agents post in Linear via Haus. Give one its own app to assign and @mention it like a teammate.';

/**
 * Linear's additions to the Agent access list: each granted Agent's identity
 * line (state and controls) as its row's description, the identity setup
 * expanding under the row that started it, and the default Agent as the
 * list's last row. The row's trailing side stays the access switch. Adds
 * nothing until the workspace and identities load, or when no workspace is
 * connected.
 */
export const LinearAgentAccess: AgentAccessExtender = ({ children, connection, serverId }) => {
    const identities = useLinearIdentities(serverId, connection.id).data;
    const workspace = useLinearWorkspace(serverId, connection.id).data;
    const canManage = useServerContext().server.role !== 'member';
    const draft = useLinearIdentityDraft(serverId, connection.id);
    const install = useLinearStartIdentityInstall(serverId);
    const arrived = useLinearIdentityArrival(identities);
    const [flow, setFlow] = useState<{ agentId: string; mode: LinearIdentityFlowMode } | null>(
        null
    );
    const [removing, setRemoving] = useState<{ agent: Agent; identity: LinearIdentity } | null>(
        null
    );

    if (!(identities && workspace)) {
        return children(null);
    }

    const memberTeams = linearMemberTeams(workspace);
    const act = (agent: Agent, action: LinearIdentityAction) => {
        if (action === 'change-teams') {
            // An admin grants the Agent's own app its teams there, as for the Haus app.
            window.open(
                linearApplicationsSettingsUrl(workspace.urlKey),
                '_blank',
                'noopener,noreferrer'
            );
            return;
        }
        const identity = identityForAgent(identities, agent.id);
        if (action === 'remove' || action === 'reinstall') {
            if (identity && action === 'remove') {
                setRemoving({ agent, identity });
            } else if (identity) {
                rememberLinearIdentityInstall(identity.id);
                void install.start(identity.id);
            }
            return;
        }
        // An installed identity already carries its flow values; only setup prepares a draft.
        if (action !== 'rotate-secret') {
            draft.prepare(agent.id);
        }
        setFlow({ agentId: agent.id, mode: linearIdentityFlowMode(action, identity) });
    };
    const closeFlow = () => {
        setFlow(null);
        draft.reset();
    };
    const hasGrant = connection.affectedAgents.length > 0;

    const extension: AgentAccessExtension = {
        description: identityExplainer,
        footer: hasGrant ? (
            <LinearDefaultAgentRow
                canManage={canManage}
                connection={connection}
                serverId={serverId}
                workspace={workspace}
            />
        ) : undefined,
        row: (agent, granted) => {
            if (!granted) {
                return {};
            }
            const identity = identityForAgent(identities, agent.id);
            const open = flow?.agentId === agent.id ? flow : null;
            return {
                description: (
                    <LinearIdentityLine
                        agentName={agent.displayName}
                        arrived={arrived === agent.id}
                        canManage={canManage}
                        identity={identity}
                        memberTeams={memberTeams}
                        onAction={(action) => act(agent, action)}
                        setupOpen={open !== null}
                    />
                ),
                detail: (
                    <LinearSetupDisclosure open={open !== null}>
                        {open ? (
                            <>
                                <Separator />
                                <LinearIdentityFlowPanel
                                    agent={agent}
                                    connectionId={connection.id}
                                    draftError={draft.error?.message ?? null}
                                    identity={identity}
                                    // A new flow starts fresh: its step state belongs to one Agent.
                                    key={`${agent.id}:${open.mode}`}
                                    mode={open.mode}
                                    onClose={closeFlow}
                                    onConnectExisting={() =>
                                        setFlow({ agentId: agent.id, mode: 'existing' })
                                    }
                                    serverId={serverId}
                                />
                            </>
                        ) : null}
                    </LinearSetupDisclosure>
                ),
            };
        },
    };

    return (
        <>
            {children(extension)}
            <LinearIdentityRemoveDialog
                connectionId={connection.id}
                onClose={() => setRemoving(null)}
                removing={removing}
                serverId={serverId}
            />
        </>
    );
};
