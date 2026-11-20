import { type ModelConnection, type ModelProvider, modelProviderSchema } from '@haus/api';
import { DataGrid, ItemCardGroup } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../../components/ui/icon.tsx';
import { useComputers } from '../../../../hooks/servers/use-computers.ts';
import { useModelConnections } from '../../../../hooks/servers/use-model-connections.ts';
import { useUsage } from '../../../../hooks/servers/use-usage.ts';
import { SettingsRowError } from '../../layout/settings-text.tsx';
import { ConnectDialog } from './connect-dialog.tsx';
import { connectionColumns, expandColumnId } from './connection-columns.tsx';
import {
    type AccountRow,
    connectionCountLabel,
    connectionRows,
    failedConnectionIds,
    rowChildren,
} from './connections-table-model.ts';
import { deviceRows } from './device-usage-rows.ts';
import { connectionErrorMessage, modelProviderNames } from './model-connection-model.ts';
import { RenameConnectionDialog } from './rename-connection-dialog.tsx';
import { useConnectionTableActions } from './use-connection-table-actions.ts';

export function ModelConnectionsGroup({
    isOwner,
    serverId,
}: {
    isOwner: boolean;
    serverId: string;
}) {
    const connections = useModelConnections(serverId);
    const usage = useUsage(serverId);
    const computers = useComputers(serverId);
    const onDevices = connections.data?.agentLoop === 'computer';
    const devicesSettled =
        !onDevices || ((usage.data || usage.error) && (computers.data || computers.error));

    if (!(connections.data && devicesSettled)) {
        return connections.error ? (
            <SettingsRowError>{connections.error.message}</SettingsRowError>
        ) : (
            <div aria-busy="true" className="min-h-24">
                <span className="sr-only">Loading connections</span>
            </div>
        );
    }
    const devicesError = onDevices ? (usage.error ?? computers.error) : null;
    return (
        <>
            <ModelConnectionsTable
                connections={connections.data.connections}
                isOwner={isOwner}
                rows={[
                    ...connectionRows(connections.data.connections),
                    ...(onDevices
                        ? deviceRows(computers.data ?? [], usage.data?.computers ?? [])
                        : []),
                ]}
                serverId={serverId}
            />
            <SettingsRowError>
                {devicesError ? `Device usage unavailable: ${devicesError.message}` : null}
            </SettingsRowError>
        </>
    );
}

export function ModelConnectionsTable({
    connections,
    isOwner,
    now = Date.now(),
    rows,
    serverId,
}: {
    connections: readonly ModelConnection[];
    isOwner: boolean;
    now?: number;
    rows: readonly AccountRow[];
    serverId: string;
}) {
    const { actions, dialog, failedEdit, renaming, setDialog, setRenaming } =
        useConnectionTableActions({ isOwner, now, serverId });

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>{connectionCountLabel(rows.length)}</ItemCardGroup.Title>
                {isOwner ? <ProviderPicker onPick={(provider) => setDialog({ provider })} /> : null}
            </ItemCardGroup.Header>
            {rows.length > 0 ? (
                <DataGrid
                    aria-label="Connections"
                    columns={connectionColumns(actions)}
                    contentClassName="min-w-[620px]"
                    data={[...rows]}
                    defaultExpandedKeys={failedConnectionIds(connections)}
                    getChildren={rowChildren}
                    getRowId={(row) => row.id}
                    treeColumn={expandColumnId}
                    treeIndent={0}
                />
            ) : null}
            <SettingsRowError>
                {failedEdit ? connectionErrorMessage(failedEdit) : null}
            </SettingsRowError>
            {dialog ? (
                <ConnectDialog
                    onClose={() => setDialog(null)}
                    provider={dialog.provider}
                    replacing={dialog.replacing}
                    serverId={serverId}
                    takenLabels={connections
                        .filter((connection) => connection.provider === dialog.provider)
                        .map((connection) => connection.label)}
                />
            ) : null}
            {renaming ? (
                <RenameConnectionDialog
                    connection={renaming}
                    onClose={() => setRenaming(null)}
                    serverId={serverId}
                />
            ) : null}
        </ItemCardGroup>
    );
}

function ProviderPicker({ onPick }: { onPick: (provider: ModelProvider) => void }) {
    return (
        <Dropdown>
            <Button aria-label="Add connection" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    {modelProviderSchema.options.map((provider) => (
                        <Dropdown.Item
                            id={provider}
                            key={provider}
                            onAction={() => onPick(provider)}
                            textValue={modelProviderNames[provider]}
                        >
                            <Label>{modelProviderNames[provider]}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
