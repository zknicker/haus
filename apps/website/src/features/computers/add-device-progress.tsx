import { Badge, Button, Spinner, Tooltip } from '@heroui/react';
import { ArrowReloadHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputerInventoryRefresh } from '../../hooks/servers/use-computer-inventory-refresh.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { type AddDeviceStatus, addDeviceStatus } from './add-device-status.ts';

export function useAddDeviceStatus(serverId: string) {
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
        return null;
    }
    return addDeviceStatus(baselineIds, computers.data ?? []);
}

export function AddDeviceStatusLine({
    serverId,
    status,
}: {
    serverId: string;
    status: AddDeviceStatus | null;
}) {
    return (
        <div aria-live="polite" className="me-auto flex min-w-0 items-center gap-2 text-sm">
            {status ? (
                <>
                    <StatusMark tone={status.tone} />
                    <span className={status.tone === 'pending' ? 'text-muted' : undefined}>
                        {status.label}
                    </span>
                    {status.recheckComputerId ? (
                        <RecheckButton computerId={status.recheckComputerId} serverId={serverId} />
                    ) : null}
                </>
            ) : (
                <span className="text-danger" role="alert">
                    Couldn’t load devices.
                </span>
            )}
        </div>
    );
}

function StatusMark({ tone }: { tone: AddDeviceStatus['tone'] }) {
    if (tone === 'pending') {
        return <Spinner size="sm" />;
    }
    return (
        <Badge
            className="static transform-none"
            color={tone === 'success' ? 'success' : 'warning'}
            size="sm"
        />
    );
}

function RecheckButton({ computerId, serverId }: { computerId: string; serverId: string }) {
    const refresh = useComputerInventoryRefresh();
    return (
        <Tooltip delay={0}>
            <Button
                aria-label="Check again"
                isIconOnly
                isPending={refresh.isPending}
                onPress={() => refresh.mutate({ computerId, serverId })}
                size="sm"
                variant="ghost"
            >
                {({ isPending }) =>
                    isPending ? (
                        <Spinner color="current" size="sm" />
                    ) : (
                        <Icon icon={ArrowReloadHorizontalIcon} size={16} />
                    )
                }
            </Button>
            <Tooltip.Content>Check again</Tooltip.Content>
        </Tooltip>
    );
}
