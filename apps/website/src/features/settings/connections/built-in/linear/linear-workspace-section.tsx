import type { LinearWorkspace } from '@haus/api';
import { Button, Chip, Dropdown, Label, ListBox, Separator } from '@heroui/react';
import { InlineSelect, ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../../components/ui/icon.tsx';
import { useLinearSetDefaultAgent } from '../../../../../hooks/linear/use-linear-set-default-agent.ts';
import { useLinearStartInstall } from '../../../../../hooks/linear/use-linear-start-install.ts';
import { useLinearWorkspace } from '../../../../../hooks/linear/use-linear-workspace.ts';
import { formatRelativeTime } from '../../../../../lib/format.ts';
import { AutomationFactRow } from '../../../../members/agent-profile/automation-fact-row.tsx';
import { useServerContext } from '../../../../servers/server-context.ts';
import { SettingsRowTitle } from '../../../layout/settings-row-title.tsx';
import { ConnectionSection } from '../../../mcp/connection-section.tsx';
import { ConnectionAddRow } from '../../../mcp/mcp-connection-account.tsx';
import type { McpConnection } from '../../../mcp/mcp-server-shared.ts';
import type { BuiltInConnectionSectionProps } from '../built-in-connection-definition.ts';
import { linearWorkspaceStatus } from './linear-identity-model.ts';

const noDefaultAgent = 'none';

/**
 * The Linear workspace this connection binds: its organization, teams, when
 * Linear last reached Haus, and the default Agent for unlabelled work. Blank
 * while loading; a connection with no workspace yet offers the install.
 */
export function LinearWorkspaceSection({ connection, serverId }: BuiltInConnectionSectionProps) {
    const workspace = useLinearWorkspace(serverId, connection.id).data;
    const canManage = useServerContext().server.role !== 'member';
    const install = useLinearStartInstall(serverId, connection.id);

    if (workspace === undefined) {
        return null;
    }

    return (
        <ConnectionSection title="Workspace">
            <ItemCardGroup variant="outline">
                {workspace ? (
                    <WorkspaceRows
                        canManage={canManage}
                        connection={connection}
                        onReconnect={() => void install.start()}
                        serverId={serverId}
                        workspace={workspace}
                    />
                ) : canManage ? (
                    <ConnectionAddRow
                        isPending={install.isPending}
                        onPress={() => void install.start()}
                        title="Connect a Linear workspace"
                    />
                ) : (
                    <ItemCard>
                        <ItemCard.Content>
                            <ItemCard.Description>
                                No Linear workspace is connected yet.
                            </ItemCard.Description>
                        </ItemCard.Content>
                    </ItemCard>
                )}
            </ItemCardGroup>
        </ConnectionSection>
    );
}

function WorkspaceRows({
    canManage,
    connection,
    onReconnect,
    serverId,
    workspace,
}: {
    canManage: boolean;
    connection: McpConnection;
    onReconnect: () => void;
    serverId: string;
    workspace: LinearWorkspace;
}) {
    const status = linearWorkspaceStatus(workspace.status);
    const teams = workspace.teams.map((team) => team.key).join(', ');

    return (
        <>
            <ItemCard>
                <EntityAvatar name={workspace.name} size="sm" />
                <ItemCard.Content>
                    <ItemCard.Title>{workspace.name}</ItemCard.Title>
                    <ItemCard.Description className="max-w-full truncate">
                        linear.app/{workspace.urlKey}
                    </ItemCard.Description>
                </ItemCard.Content>
                <ItemCard.Action className="flex items-center gap-2">
                    {status ? (
                        <Chip color={status.color} size="sm" variant="soft">
                            <Chip.Label>{status.label}</Chip.Label>
                        </Chip>
                    ) : null}
                    <Dropdown>
                        <Button
                            aria-label={`Actions for ${workspace.name}`}
                            isIconOnly
                            size="sm"
                            variant="ghost"
                        >
                            <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
                        </Button>
                        <Dropdown.Popover placement="bottom end">
                            <Dropdown.Menu>
                                <Dropdown.Item
                                    id="open"
                                    onAction={() =>
                                        window.open(
                                            `https://linear.app/${encodeURIComponent(workspace.urlKey)}`,
                                            '_blank',
                                            'noopener,noreferrer'
                                        )
                                    }
                                    textValue="Open in Linear"
                                >
                                    <Label>Open in Linear</Label>
                                </Dropdown.Item>
                                {canManage && workspace.status !== 'removed' ? (
                                    <Dropdown.Item
                                        id="reconnect"
                                        onAction={onReconnect}
                                        textValue="Reconnect"
                                    >
                                        <Label>Reconnect</Label>
                                    </Dropdown.Item>
                                ) : null}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </ItemCard.Action>
            </ItemCard>
            <Separator />
            <AutomationFactRow title="Teams">{teams || 'None'}</AutomationFactRow>
            <Separator />
            <AutomationFactRow title="Last delivery received">
                {workspace.lastDeliveryAt ? formatRelativeTime(workspace.lastDeliveryAt) : 'Never'}
            </AutomationFactRow>
            <Separator />
            <DefaultAgentRow
                canManage={canManage}
                connection={connection}
                serverId={serverId}
                workspace={workspace}
            />
        </>
    );
}

function DefaultAgentRow({
    canManage,
    connection,
    serverId,
    workspace,
}: {
    canManage: boolean;
    connection: McpConnection;
    serverId: string;
    workspace: LinearWorkspace;
}) {
    const setDefault = useLinearSetDefaultAgent(serverId, connection.id);
    const options = [
        { id: noDefaultAgent, label: 'None' },
        ...connection.affectedAgents.map((agent) => ({ id: agent.id, label: agent.name })),
    ];

    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info="Answers a mention or delegation of the Haus app in Linear when no Agent label names an Agent. Only Agents with access can be chosen.">
                    Default Agent
                </SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <InlineSelect
                    aria-label="Default Agent"
                    isDisabled={!canManage || setDefault.isPending}
                    onChange={(key) => {
                        if (typeof key === 'string') {
                            setDefault.setDefaultAgent(key === noDefaultAgent ? null : key);
                        }
                    }}
                    value={workspace.defaultAgentId ?? noDefaultAgent}
                >
                    <InlineSelect.Trigger>
                        <InlineSelect.Value />
                        <InlineSelect.Indicator />
                    </InlineSelect.Trigger>
                    <InlineSelect.Popover>
                        <ListBox items={options}>
                            {(option) => (
                                <ListBox.Item id={option.id} textValue={option.label}>
                                    {option.label}
                                    <ListBox.ItemIndicator />
                                </ListBox.Item>
                            )}
                        </ListBox>
                    </InlineSelect.Popover>
                </InlineSelect>
            </ItemCard.Action>
        </ItemCard>
    );
}
