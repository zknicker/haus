import { Alert, Spinner } from '@heroui/react';
import * as React from 'react';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { addDeviceStatus } from './add-device-status.ts';

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
    if (computers.error && !computers.data) {
        return (
            <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Devices could not load</Alert.Title>
                    <Alert.Description>{computers.error.message}</Alert.Description>
                </Alert.Content>
            </Alert>
        );
    }
    const status = addDeviceStatus(baselineIds, computers.data ?? [], serverSlug);

    if (status.kind === 'waiting' || status.kind === 'detecting') {
        return (
            <p aria-live="polite" className="text-muted flex items-center gap-2 text-sm">
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
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{status.title}</Alert.Title>
                <Alert.Description>{status.message}</Alert.Description>
                {status.command ? <CodeSnippet lines={status.command} /> : null}
            </Alert.Content>
        </Alert>
    );
}
