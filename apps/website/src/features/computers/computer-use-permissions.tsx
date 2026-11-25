import type { ComputerUseReadiness } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Button, Separator } from '@heroui/react';
import { Fragment } from 'react';
import { useComputerUseRecheck } from '../../hooks/computer-use/use-computer-use-recheck.ts';
import { useLocalComputerId } from '../../hooks/repos/use-local-computer-id.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import {
    type ComputerUsePermission,
    computerUseNeedsGrant,
    computerUsePermissions,
    defaultComputerAppPath,
    permissionStateLabel,
    wrongMacLine,
} from './computer-use-model.ts';
import { ComputerUseSetupDialog } from './computer-use-setup-dialog.tsx';
import { computerLabel } from './presentation.ts';

export function ComputerUsePermissions({
    computerId,
    deviceName,
    onOpenChange,
    openId,
    readiness,
    serverId,
}: {
    computerId: string;
    deviceName: string;
    onOpenChange: (id: ComputerUsePermission['id'] | null) => void;
    openId: ComputerUsePermission['id'] | null;
    readiness: ComputerUseReadiness | undefined;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const localComputerId = useLocalComputerId(serverId);
    const needsGrant = computerUseNeedsGrant(readiness);
    const recheck = useComputerUseRecheck({
        active: needsGrant || openId !== null,
        computerId,
        serverId,
    });
    const permissions = computerUsePermissions(readiness);
    const missing = permissions.filter((permission) => permission.state !== 'granted');
    const open = permissions.find((permission) => permission.id === openId);
    const notInstalled = readiness !== undefined && !readiness.installed;
    const wrongMac = wrongMacLine({
        deviceName,
        devices: (computers.data ?? []).map((device) => ({
            id: device.id,
            name: computerLabel(device),
        })),
        localComputerId,
        targetId: computerId,
    });
    const dialog = open ? (
        <ComputerUseSetupDialog
            appPath={readiness?.appPath ?? defaultComputerAppPath}
            deviceName={deviceName}
            isChecking={recheck.isPending}
            onClose={() => onOpenChange(null)}
            permission={open}
            wrongMac={wrongMac}
        />
    ) : null;
    if (!(notInstalled || needsGrant)) {
        return dialog;
    }
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>macOS permissions</ItemCardGroup.Title>
                    {readiness?.permissionsMoved ? (
                        <ItemCardGroup.Description>
                            Haus Computer is an app now, so macOS asks again.
                        </ItemCardGroup.Description>
                    ) : null}
                </ItemCardGroup.Header>
                {notInstalled ? (
                    <Alert status="warning">
                        <Alert.Indicator />
                        <Alert.Content>
                            <Alert.Title>Update Haus Computer on this Mac.</Alert.Title>
                        </Alert.Content>
                    </Alert>
                ) : (
                    <ItemCardGroup>
                        {missing.map((permission, index) => (
                            <Fragment key={permission.id}>
                                {index > 0 ? <Separator /> : null}
                                <PermissionRow
                                    onOpenSettings={() => {
                                        onOpenChange(permission.id);
                                        window.location.assign(permission.settingsUrl);
                                    }}
                                    permission={permission}
                                />
                            </Fragment>
                        ))}
                    </ItemCardGroup>
                )}
            </ItemCardGroup>
            {dialog}
        </section>
    );
}

function PermissionRow({
    onOpenSettings,
    permission,
}: {
    onOpenSettings: () => void;
    permission: ComputerUsePermission;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{permission.pane}</ItemCard.Title>
                <ItemCard.Description>
                    {permissionStateLabel(permission.state)}
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <Button onPress={onOpenSettings} size="sm" variant="secondary">
                    Open Settings
                </Button>
            </ItemCard.Action>
        </ItemCard>
    );
}
