import { type ModelConnection, type ModelProvider, modelProviderSchema } from '@haus/api';
import { DataGrid, ItemCardGroup } from '@heroui-pro/react';
import { Button, Dropdown, Label } from '@heroui/react';
import { useModelConnections } from '../../../../hooks/servers/use-model-connections.ts';
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
import { ModelAccountLogo } from './model-account-mark.tsx';
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

    if (!connections.data) {
        return connections.error ? (
            <SettingsRowError>{connections.error.message}</SettingsRowError>
        ) : (
            <div aria-busy="true" className="min-h-24">
                <span className="sr-only">Loading connections</span>
            </div>
        );
    }
    return (
        <ModelConnectionsTable
            connections={connections.data.connections}
            isOwner={isOwner}
            rows={connectionRows(connections.data.connections)}
            serverId={serverId}
        />
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
            <ItemCardGroup.Header>
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
            <Button size="sm" variant="secondary">
                Add connection
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
                            <ModelAccountLogo account={provider} />
                            <Label>{modelProviderNames[provider]}</Label>
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
