import { ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import { ComputerIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { serverComputerRoute } from '../servers/server-routes.ts';
import { SettingsEmptyRow, SettingsEmptyState } from '../settings/layout/settings-empty.tsx';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../settings/layout/settings-page-header.tsx';
import { AddComputerDialog } from './add-computer-dialog.tsx';
import { deviceGroups } from './device-list-model.ts';
import { DeviceRow } from './device-row.tsx';

type Device = HausOutputs['computer']['list'][number];

export function DevicesPage({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
    const computers = useComputers(serverId);
    const [searchParams] = useSearchParams();
    const [adding, setAdding] = React.useState(false);
    const requestedId = searchParams.get('computer');

    if (requestedId) {
        return <Navigate replace to={serverComputerRoute(serverSlug, requestedId)} />;
    }

    const groups = computers.data ? deviceGroups(computers.data) : null;
    const addButton = (
        <Button onPress={() => setAdding(true)} size="sm" variant="secondary">
            Add device
        </Button>
    );

    return (
        <SettingsPageColumn width="table">
            <SettingsPageHeader title="Devices" />
            {computers.error && !computers.data ? (
                <SettingsEmptyState
                    description="Try opening this page again."
                    role="status"
                    title="Couldn’t load devices"
                />
            ) : groups === null ? null : groups.yours.length + groups.others.length === 0 ? (
                <SettingsEmptyState
                    action={<Button onPress={() => setAdding(true)}>Add device</Button>}
                    description="Devices run Captains and keep their workspaces, runtime access, and execution state on your machine."
                    icon={ComputerIcon}
                    title="Attach a device"
                />
            ) : (
                <>
                    <DeviceGroup
                        action={addButton}
                        devices={groups.yours}
                        serverId={serverId}
                        serverSlug={serverSlug}
                        title="Your devices"
                    />
                    {groups.others.length > 0 ? (
                        <DeviceGroup
                            devices={groups.others}
                            serverId={serverId}
                            serverSlug={serverSlug}
                            title="Other devices"
                        />
                    ) : null}
                </>
            )}
            <AddComputerDialog
                onOpenChange={setAdding}
                open={adding}
                serverId={serverId}
                serverSlug={serverSlug}
            />
        </SettingsPageColumn>
    );
}

function DeviceGroup({
    action,
    devices,
    serverId,
    serverSlug,
    title,
}: {
    action?: React.ReactNode;
    devices: readonly Device[];
    serverId: string;
    serverSlug: string;
    title: string;
}) {
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
                    {action}
                </ItemCardGroup.Header>
                <ItemCardGroup>
                    {devices.length === 0 ? (
                        <SettingsEmptyRow>You haven’t attached a device yet.</SettingsEmptyRow>
                    ) : (
                        devices.map((device, index) => (
                            <React.Fragment key={device.id}>
                                {index > 0 ? <Separator /> : null}
                                <DeviceRow
                                    device={device}
                                    serverId={serverId}
                                    serverSlug={serverSlug}
                                />
                            </React.Fragment>
                        ))
                    )}
                </ItemCardGroup>
            </ItemCardGroup>
        </section>
    );
}
