import type { Agent, LinearIdentity } from '@haus/api';
import { Button, Chip, Dropdown, Label, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment, useState } from 'react';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../../components/ui/icon.tsx';
import { useLinearIdentities } from '../../../../../hooks/linear/use-linear-identities.ts';
import { useLinearIdentityDraft } from '../../../../../hooks/linear/use-linear-identity-draft.ts';
import { useLinearStartIdentityInstall } from '../../../../../hooks/linear/use-linear-start-identity-install.ts';
import { useAgents } from '../../../../../hooks/members/use-agents.ts';
import { useServerContext } from '../../../../servers/server-context.ts';
import { ConnectionSection } from '../../../mcp/connection-section.tsx';
import type { BuiltInConnectionSectionProps } from '../built-in-connection-definition.ts';
import { LinearIdentityFlowDialog } from './linear-identity-flow-dialog.tsx';
import type { LinearIdentityFlowMode } from './linear-identity-flow-model.ts';
import {
    identityForAgent,
    type LinearIdentityAction,
    linearIdentityRow,
} from './linear-identity-model.ts';
import { LinearIdentityRemoveDialog } from './linear-identity-remove-dialog.tsx';

const actionLabels: Record<LinearIdentityAction, string> = {
    'connect-existing': 'Connect existing app',
    continue: 'Continue setup',
    give: 'Give Linear identity',
    reinstall: 'Install again',
    remove: 'Remove identity',
};

/**
 * Every Agent with access to this connection, and how it shows up in Linear:
 * through the Haus app, or as its own Linear teammate. Agent access above
 * stays the only grant switch, so an Agent without access is not listed.
 */
export function LinearIdentitiesSection({ connection, serverId }: BuiltInConnectionSectionProps) {
    const agents = useAgents(serverId).data;
    const identities = useLinearIdentities(serverId, connection.id).data;
    const canManage = useServerContext().server.role !== 'member';
    const draft = useLinearIdentityDraft(serverId, connection.id);
    const install = useLinearStartIdentityInstall(serverId);
    const [flow, setFlow] = useState<{ agent: Agent; mode: LinearIdentityFlowMode } | null>(null);
    const [removing, setRemoving] = useState<{ agent: Agent; identity: LinearIdentity } | null>(
        null
    );

    const granted = new Set(connection.affectedAgents.map((agent) => agent.id));
    const rows = agents?.filter((agent) => granted.has(agent.id));
    if (!(rows && identities) || rows.length === 0) {
        return null;
    }

    const act = (agent: Agent, identity: LinearIdentity | null, action: LinearIdentityAction) => {
        if (action === 'remove' && identity) {
            setRemoving({ agent, identity });
        } else if (action === 'reinstall' && identity) {
            void install.start(identity.id);
        } else {
            draft.prepare(agent.id);
            setFlow({ agent, mode: action === 'connect-existing' ? 'existing' : 'create' });
        }
    };

    return (
        <ConnectionSection count={rows.length} title="Agent Identities">
            <ItemCardGroup variant="outline">
                {rows.map((agent, index) => (
                    <Fragment key={agent.id}>
                        {index > 0 ? <Separator /> : null}
                        <IdentityRow
                            agent={agent}
                            canManage={canManage}
                            identity={identityForAgent(identities, agent.id)}
                            onAction={act}
                        />
                    </Fragment>
                ))}
            </ItemCardGroup>
            <LinearIdentityFlowDialog
                agentName={flow?.agent.displayName ?? ''}
                connectionId={connection.id}
                draft={draft.draft}
                draftError={draft.error?.message ?? null}
                mode={flow?.mode ?? null}
                onClose={() => {
                    setFlow(null);
                    draft.reset();
                }}
                serverId={serverId}
            />
            <LinearIdentityRemoveDialog
                connectionId={connection.id}
                onClose={() => setRemoving(null)}
                removing={removing}
                serverId={serverId}
            />
        </ConnectionSection>
    );
}

function IdentityRow({
    agent,
    canManage,
    identity,
    onAction,
}: {
    agent: Agent;
    canManage: boolean;
    identity: LinearIdentity | null;
    onAction: (agent: Agent, identity: LinearIdentity | null, action: LinearIdentityAction) => void;
}) {
    const row = linearIdentityRow(agent.displayName, identity);

    return (
        <ItemCard>
            <EntityAvatar name={agent.displayName} size="sm" src={agent.avatarUrl} />
            <ItemCard.Content>
                <ItemCard.Title>{agent.displayName}</ItemCard.Title>
                <ItemCard.Description className="max-w-full">
                    {row.description}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action className="flex items-center gap-2">
                {row.status ? (
                    <Chip color={row.status.color} size="sm" variant="soft">
                        <Chip.Label>{row.status.label}</Chip.Label>
                    </Chip>
                ) : null}
                {canManage ? (
                    <Dropdown>
                        <Button
                            aria-label={`Linear identity actions for ${agent.displayName}`}
                            isIconOnly
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu>
                                {row.actions.map((action) => (
                                    <Dropdown.Item
                                        id={action}
                                        key={action}
                                        onAction={() => onAction(agent, identity, action)}
                                        textValue={actionLabels[action]}
                                        variant={action === 'remove' ? 'danger' : undefined}
                                    >
                                        <Label>{actionLabels[action]}</Label>
                                    </Dropdown.Item>
                                ))}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                ) : null}
            </ItemCard.Action>
        </ItemCard>
    );
}
