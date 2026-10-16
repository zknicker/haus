import type { LinearWorkspace } from '@haus/api';
import { Button, Chip, Dropdown, Label, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { EntityAvatar } from '../../../../../components/ui/entity-avatar.tsx';
import { Icon } from '../../../../../components/ui/icon.tsx';
import { useLinearStartInstall } from '../../../../../hooks/linear/use-linear-start-install.ts';
import { useLinearSyncTeams } from '../../../../../hooks/linear/use-linear-sync-teams.ts';
import { useLinearWorkspace } from '../../../../../hooks/linear/use-linear-workspace.ts';
import { useServerContext } from '../../../../servers/server-context.ts';
import { ConnectionSection } from '../../../mcp/connection-section.tsx';
import { ConnectionAddRow } from '../../../mcp/mcp-connection-account.tsx';
import type { BuiltInConnectionSectionProps } from '../built-in-connection-definition.ts';
import { linearWorkspaceStatus } from './linear-identity-model.ts';
import { LinearSetupNotice } from './linear-setup-notice.tsx';
import { LinearWorkspaceHealthRows } from './linear-workspace-health-rows.tsx';

/**
 * The Linear workspace this connection binds: its organization and the teams
 * the Haus app reaches, plus when Linear last reached Haus only while that is
 * worth a look. Blank while loading; a connection with no workspace yet
 * offers the install. The install callback lands here, so its outcome sits
 * above the workspace.
 */
export function LinearWorkspaceSection({ connection, serverId }: BuiltInConnectionSectionProps) {
    const workspace = useLinearWorkspace(serverId, connection.id).data;
    const canManage = useServerContext().server.role !== 'member';
    const install = useLinearStartInstall(serverId, connection.id);
    // The definition's connect: a new workspace becomes its own connection.
    const connectAnother = useLinearStartInstall(serverId);
    const syncTeams = useLinearSyncTeams(serverId, connection.id);

    const notice = <LinearSetupNotice />;
    if (workspace === undefined) {
        return notice;
    }

    return (
        <>
            {notice}
            <ConnectionSection title="Workspace">
                <ItemCardGroup variant="outline">
                    {workspace ? (
                        <WorkspaceRows
                            canManage={canManage}
                            onConnectAnother={() => void connectAnother.start()}
                            onReconnect={() => void install.start()}
                            onRefreshTeams={syncTeams.syncTeams}
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
        </>
    );
}

function WorkspaceRows({
    canManage,
    onConnectAnother,
    onReconnect,
    onRefreshTeams,
    workspace,
}: {
    canManage: boolean;
    onConnectAnother: () => void;
    onReconnect: () => void;
    /** Re-reads the teams the Haus app reaches, after an admin changed them in Linear. */
    onRefreshTeams: () => void;
    workspace: LinearWorkspace;
}) {
    const status = linearWorkspaceStatus(workspace.status);

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
                                {canManage && workspace.status === 'active' ? (
                                    <Dropdown.Item
                                        id="refresh-teams"
                                        onAction={onRefreshTeams}
                                        textValue="Refresh teams"
                                    >
                                        <Label>Refresh teams</Label>
                                    </Dropdown.Item>
                                ) : null}
                                {canManage && workspace.status !== 'removed' ? (
                                    <Dropdown.Item
                                        id="reconnect"
                                        onAction={onReconnect}
                                        textValue="Reconnect"
                                    >
                                        <Label>Reconnect</Label>
                                    </Dropdown.Item>
                                ) : null}
                                {canManage ? (
                                    <Dropdown.Item
                                        id="connect-another"
                                        onAction={onConnectAnother}
                                        textValue="Connect another workspace"
                                    >
                                        <Label>Connect another workspace</Label>
                                    </Dropdown.Item>
                                ) : null}
                            </Dropdown.Menu>
                        </Dropdown.Popover>
                    </Dropdown>
                </ItemCard.Action>
            </ItemCard>
            <Separator />
            <LinearWorkspaceHealthRows
                canManage={canManage && workspace.status !== 'removed'}
                workspace={workspace}
            />
        </>
    );
}
