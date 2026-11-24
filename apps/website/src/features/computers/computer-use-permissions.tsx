import type { ComputerUseReadiness } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Button, Separator } from '@heroui/react';
import { Fragment, useState } from 'react';
import { useComputerUseRecheck } from '../../hooks/computer-use/use-computer-use-recheck.ts';
import {
    type ComputerUsePermission,
    computerUseNeedsGrant,
    computerUsePermissions,
    defaultComputerAppPath,
    permissionStateLabel,
} from './computer-use-model.ts';
import { ComputerUseSetupDialog } from './computer-use-setup-dialog.tsx';

export function ComputerUsePermissions({
    computerId,
    deviceName,
    readiness,
    serverId,
}: {
    computerId: string;
    deviceName: string;
    readiness: ComputerUseReadiness | undefined;
    serverId: string;
}) {
    const [openId, setOpenId] = useState<ComputerUsePermission['id'] | null>(null);
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
    const dialog = open ? (
        <ComputerUseSetupDialog
            appPath={readiness?.appPath ?? defaultComputerAppPath}
            deviceName={deviceName}
            isChecking={recheck.isPending}
            onClose={() => setOpenId(null)}
            permission={open}
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
                                        setOpenId(permission.id);
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
