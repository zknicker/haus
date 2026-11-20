import type { Agent, ModelConnection } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Description, Label, ListBox, Select } from '@heroui/react';
import { Link, useParams } from 'react-router-dom';
import { useAgentModelConnection } from '../../../hooks/members/use-agent-model-connection.ts';
import { useModelConnections } from '../../../hooks/servers/use-model-connections.ts';
import { serverSettingsSectionRoute } from '../../servers/server-routes.ts';
import { SettingsFact, SettingsRowError } from '../../settings/layout/settings-text.tsx';
import {
    agentConnectionChoice,
    connectionIdForKey,
    defaultConnectionKey,
} from '../agent-model-connection-model.ts';

export function AgentModelConnectionRow({ agent, canEdit }: { agent: Agent; canEdit: boolean }) {
    const connections = useModelConnections(agent.serverId);
    if (!(connections.error || connections.data?.agentLoop === 'runner')) {
        return null;
    }

    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Connection</ItemCard.Title>
                <SettingsRowError>{connections.error?.message}</SettingsRowError>
            </ItemCard.Content>
            <ItemCard.Action>
                {connections.data ? (
                    <AgentConnectionControl
                        agent={agent}
                        canEdit={canEdit}
                        connections={connections.data.connections}
                    />
                ) : null}
            </ItemCard.Action>
        </ItemCard>
    );
}

export function AgentConnectionControl({
    agent,
    canEdit,
    connections,
}: {
    agent: Pick<Agent, 'desiredModelId' | 'displayName' | 'id' | 'modelConnectionId' | 'serverId'>;
    canEdit: boolean;
    connections: readonly ModelConnection[];
}) {
    const { slug } = useParams();
    const assignment = useAgentModelConnection(agent.serverId, agent.id);
    const choice = agentConnectionChoice(
        assignment.isPending
            ? { ...agent, modelConnectionId: assignment.variables.connectionId }
            : agent,
        connections
    );

    if (choice.kind === 'none') {
        return (
            <SettingsFact>
                No {choice.providerName} connection
                {slug ? (
                    <>
                        {' · '}
                        <Link
                            className="text-accent underline"
                            to={serverSettingsSectionRoute(slug, 'models')}
                        >
                            Settings → Models
                        </Link>
                    </>
                ) : null}
            </SettingsFact>
        );
    }

    const selectedLabel =
        choice.options.find((connection) => connection.id === choice.selectedKey)?.label ??
        'Default';
    if (!canEdit) {
        return <SettingsFact>{selectedLabel}</SettingsFact>;
    }

    return (
        <Select
            aria-label={`${agent.displayName}'s ${choice.providerName} connection`}
            className="w-48"
            isDisabled={assignment.isPending}
            onChange={(key) => {
                if (key !== choice.selectedKey) {
                    void assignment.assign(connectionIdForKey(key));
                }
            }}
            value={choice.selectedKey}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value>{({ selectedText }) => selectedText}</Select.Value>
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    <ListBox.Item id={defaultConnectionKey} textValue="Default">
                        <div className="flex flex-col">
                            <Label>Default</Label>
                            <Description>{choice.defaultLabel}</Description>
                        </div>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {choice.options.map((connection) => (
                        <ListBox.Item
                            id={connection.id}
                            key={connection.id}
                            textValue={connection.label}
                        >
                            <Label>{connection.label}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}
