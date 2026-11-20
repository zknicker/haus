import { DataGrid, type DataGridColumn, EmptyState, ItemCardGroup } from '@heroui-pro/react';
import { Button, Chip } from '@heroui/react';
import { ComputerIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { formatRelativeTime } from '../../lib/format.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { serverComputerRoute } from '../servers/server-routes.ts';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { AddComputerDialog } from './add-computer-dialog.tsx';
import { ComputerDiskChip } from './computer-disk-warning.tsx';
import { computerDiskWarning } from './computer-disk.ts';
import { computerHealthColor, computerHealthLabel, computerLabel } from './presentation.ts';

type Computer = HausOutputs['computer']['list'][number];

export function DevicesPage({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
    const computers = useComputers(serverId);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [adding, setAdding] = React.useState(false);
    const requestedId = searchParams.get('computer');
    const columns = React.useMemo(() => deviceColumns(serverId), [serverId]);

    if (requestedId) {
        return <Navigate replace to={serverComputerRoute(serverSlug, requestedId)} />;
    }

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Devices" />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                    <ItemCardGroup.Title>
                        Your devices
                        {computers.data ? (
                            <span className="text-muted ms-2 tabular-nums">
                                {computers.data.length}
                            </span>
                        ) : null}
                    </ItemCardGroup.Title>
                    <Button onPress={() => setAdding(true)} size="sm" variant="secondary">
                        Add device
                    </Button>
                </ItemCardGroup.Header>
                {computers.error && !computers.data ? (
                    <p className="text-danger px-4 text-sm" role="alert">
                        Couldn’t load devices. Try opening this page again.
                    </p>
                ) : computers.data === undefined ? (
                    <div aria-busy="true" className="min-h-32">
                        <span className="sr-only">Loading devices</span>
                    </div>
                ) : computers.data.length === 0 ? (
                    <DevicesEmpty onAdd={() => setAdding(true)} />
                ) : (
                    <DataGrid
                        aria-label="Devices"
                        columns={columns}
                        contentClassName="min-w-[560px]"
                        data={computers.data}
                        getRowId={(item) => item.id}
                        onRowAction={(key) =>
                            navigate(serverComputerRoute(serverSlug, String(key)))
                        }
                    />
                )}
            </ItemCardGroup>
            <AddComputerDialog
                onOpenChange={setAdding}
                open={adding}
                serverId={serverId}
                serverSlug={serverSlug}
            />
        </SettingsPageColumn>
    );
}

function deviceColumns(serverId: string) {
    return [
        {
            cell: (computer) => (
                <span className="flex min-w-0 items-center gap-2.5">
                    <Icon aria-hidden="true" className="text-muted shrink-0" icon={ComputerIcon} />
                    <span className="text-foreground truncate font-medium">
                        {computerLabel(computer)}
                    </span>
                </span>
            ),
            header: 'Name',
            id: 'name',
            isRowHeader: true,
            minWidth: 220,
        },
        {
            cell: (computer) => (
                <span className="flex items-center gap-1.5">
                    <Chip color={computerHealthColor(computer.health)} size="sm" variant="soft">
                        <Chip.Label>{computerHealthLabel(computer.health)}</Chip.Label>
                    </Chip>
                    {computerDiskWarning(computer) ? (
                        <ComputerDiskChip computerId={computer.id} serverId={serverId} />
                    ) : null}
                </span>
            ),
            header: 'Status',
            id: 'status',
        },
        {
            cell: (computer) => (
                <span className="text-muted tabular-nums">
                    {computer.productVersion ? `v${computer.productVersion}` : '—'}
                </span>
            ),
            header: 'Version',
            id: 'version',
        },
        {
            align: 'end',
            cell: (computer) => (
                <span className="text-muted tabular-nums">
                    {computer.lastConnectedAt
                        ? formatRelativeTime(computer.lastConnectedAt)
                        : 'Never'}
                </span>
            ),
            header: 'Last connected',
            id: 'lastConnected',
        },
    ] satisfies DataGridColumn<Computer>[];
}

function DevicesEmpty({ onAdd }: { onAdd: () => void }) {
    return (
        <EmptyState className="py-10">
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon icon={ComputerIcon} />
                </EmptyState.Media>
                <EmptyState.Title>Attach a device</EmptyState.Title>
                <EmptyState.Description>
                    Devices run Captains and keep their workspaces, runtime access, and execution
                    state on your machine.
                </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
                <Button onPress={onAdd}>Add device</Button>
            </EmptyState.Content>
        </EmptyState>
    );
}
