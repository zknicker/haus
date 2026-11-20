import { Button, Spinner } from '@heroui/react';
import * as React from 'react';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { useComputerInventoryRefresh } from '../../hooks/servers/use-computer-inventory-refresh.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { cn } from '../../lib/utils.ts';
import { type AddDeviceStatus, addDeviceStatus } from './add-device-status.ts';

export function AddDeviceProgress({ serverId }: { serverId: string }) {
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
        <div aria-live="polite" className="grid min-w-0 gap-3">
            {computers.error && !computers.data ? (
                <p className="text-danger text-sm" role="alert">
                    Couldn’t load devices.
                </p>
            ) : (
                <AddDeviceStatusLine
                    serverId={serverId}
                    status={addDeviceStatus(baselineIds, computers.data ?? [])}
                />
            )}
        </div>
    );
}

function AddDeviceStatusLine({ serverId, status }: { serverId: string; status: AddDeviceStatus }) {
    const refresh = useComputerInventoryRefresh();
    const recheckComputerId = status.recheckComputerId;
    return (
        <>
            <div className="flex min-h-8 items-center gap-2 text-sm">
                {status.tone === 'pending' ? (
                    <Spinner size="sm" />
                ) : (
                    <span
                        aria-hidden="true"
                        className={cn(
                            'size-2 shrink-0 rounded-full',
                            status.tone === 'success' ? 'bg-success' : 'bg-warning'
                        )}
                    />
                )}
                <span className={status.tone === 'pending' ? 'text-muted' : undefined}>
                    {status.label}
                </span>
                {recheckComputerId ? (
                    <Button
                        className="ms-auto"
                        isPending={refresh.isPending}
                        onPress={() => refresh.mutate({ computerId: recheckComputerId, serverId })}
                        size="sm"
                        variant="ghost"
                    >
                        Check again
                    </Button>
                ) : null}
            </div>
            {status.command ? <CodeSnippet lines={status.command} wrap /> : null}
        </>
    );
}
