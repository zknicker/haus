import { Alert, Button, Spinner } from '@heroui/react';
import * as React from 'react';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { useComputerInventoryRefresh } from '../../hooks/servers/use-computer-inventory-refresh.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { type AddDeviceStatus, addDeviceStatus } from './add-device-status.ts';

export function AddDeviceProgress({
    serverId,
    serverSlug,
}: {
    serverId: string;
    serverSlug: string;
}) {
    const computers = useComputers(serverId);
    const [baselineIds, setBaselineIds] = React.useState<ReadonlySet<string> | null>(null);
    const settledIds =
        computers.data && !computers.isFetching
            ? computers.data.map((computer) => computer.id).join(',')
            : null;
    if (baselineIds === null && settledIds !== null) {
        setBaselineIds(new Set(settledIds.split(',').filter(Boolean)));
    }

    return (
        <div aria-live="polite">
            {computers.error && !computers.data ? (
                <Alert role="alert" status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Devices could not load</Alert.Title>
                        <Alert.Description>{computers.error.message}</Alert.Description>
                    </Alert.Content>
                </Alert>
            ) : (
                <AddDeviceStatusView
                    serverId={serverId}
                    status={addDeviceStatus(baselineIds, computers.data ?? [], serverSlug)}
                />
            )}
        </div>
    );
}

function AddDeviceStatusView({ serverId, status }: { serverId: string; status: AddDeviceStatus }) {
    const refresh = useComputerInventoryRefresh();
    if (status.kind === 'waiting' || status.kind === 'detecting') {
        return (
            <p className="text-muted flex items-center gap-2 text-sm">
                <Spinner size="sm" />
                {status.kind === 'waiting'
                    ? 'Waiting for the device to connect…'
                    : 'Device connected. Checking what it can run…'}
            </p>
        );
    }
    if (status.kind === 'ready') {
        return (
            <Alert status="success">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Device ready</Alert.Title>
                    <Alert.Description>It can run Captains now.</Alert.Description>
                </Alert.Content>
            </Alert>
        );
    }
    return (
        <div className="grid min-w-0 gap-3">
            <Alert role="alert" status="warning">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>{status.title}</Alert.Title>
                    <Alert.Description>{status.message}</Alert.Description>
                </Alert.Content>
                {status.recheck ? (
                    <Button
                        isPending={refresh.isPending}
                        onPress={() => refresh.mutate({ computerId: status.computerId, serverId })}
                        size="sm"
                        variant="secondary"
                    >
                        Check again
                    </Button>
                ) : null}
            </Alert>
            {status.command ? <CodeSnippet lines={status.command} wrap /> : null}
        </div>
    );
}
