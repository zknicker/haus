import type { ModelConnection, ModelProvider } from '@haus/api';
import { ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import * as React from 'react';
import { useModelConnections } from '../../../../hooks/servers/use-model-connections.ts';
import { SettingsRowError } from '../../layout/settings-text.tsx';
import { ConnectDialog } from './connect-dialog.tsx';
import { connectionsByProvider, modelProviderNames } from './model-connection-model.ts';
import { ModelConnectionRow } from './model-connection-row.tsx';

export function ModelConnectionsGroup({
    isOwner,
    serverId,
}: {
    isOwner: boolean;
    serverId: string;
}) {
    const connections = useModelConnections(serverId);

    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>Connections</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {connections.data ? (
                <ModelConnectionProviders
                    connections={connections.data.connections}
                    isOwner={isOwner}
                    serverId={serverId}
                />
            ) : (
                <SettingsRowError>{connections.error?.message}</SettingsRowError>
            )}
        </ItemCardGroup>
    );
}

export function ModelConnectionProviders({
    connections,
    isOwner,
    serverId,
}: {
    connections: readonly ModelConnection[];
    isOwner: boolean;
    serverId: string;
}) {
    return (
        <div className="flex flex-col gap-3">
            {connectionsByProvider(connections).map((group) => (
                <ProviderCard
                    connections={group.connections}
                    isOwner={isOwner}
                    key={group.provider}
                    provider={group.provider}
                    serverId={serverId}
                />
            ))}
        </div>
    );
}

function ProviderCard({
    connections,
    isOwner,
    provider,
    serverId,
}: {
    connections: ModelConnection[];
    isOwner: boolean;
    provider: ModelProvider;
    serverId: string;
}) {
    const [dialog, setDialog] = React.useState<{ replacing?: ModelConnection } | null>(null);
    const name = modelProviderNames[provider];

    return (
        <ItemCardGroup className="overflow-hidden">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>{name}</ItemCardGroup.Title>
                {isOwner ? (
                    <Button
                        aria-label={`Connect ${name}`}
                        onPress={() => setDialog({})}
                        size="sm"
                        variant="secondary"
                    >
                        Connect
                    </Button>
                ) : null}
            </ItemCardGroup.Header>
            {connections.map((connection) => (
                <React.Fragment key={connection.id}>
                    <Separator />
                    <ModelConnectionRow
                        connection={connection}
                        isOwner={isOwner}
                        onReconnect={() => setDialog({ replacing: connection })}
                        serverId={serverId}
                    />
                </React.Fragment>
            ))}
            {dialog ? (
                <ConnectDialog
                    onClose={() => setDialog(null)}
                    provider={provider}
                    {...dialog}
                    serverId={serverId}
                    takenLabels={labelsOf(connections)}
                />
            ) : null}
        </ItemCardGroup>
    );
}

function labelsOf(connections: readonly ModelConnection[]) {
    return connections.map((connection) => connection.label);
}
