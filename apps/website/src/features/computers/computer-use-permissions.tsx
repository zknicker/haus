import type { ComputerUseReadiness } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { Alert, Button, Separator, toast } from '@heroui/react';
import { Copy01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment } from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputerUseRecheck } from '../../hooks/computer-use/use-computer-use-recheck.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import {
    SettingsRowTitle,
    SettingsStatusChip,
    SettingsStatusTitle,
} from '../settings/layout/settings-row-title.tsx';
import {
    type ComputerUsePermission,
    computerUseNeedsGrant,
    computerUsePermissions,
    defaultComputerAppPath,
    permissionStateLabel,
} from './computer-use-model.ts';
import { StatusInfoTitle } from './status-info-title.tsx';

export function ComputerUsePermissionNotices({
    deviceName,
    readiness,
}: {
    deviceName: string;
    readiness: ComputerUseReadiness | undefined;
}) {
    if (readiness && !readiness.installed) {
        return (
            <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Computer use isn’t set up</Alert.Title>
                    <Alert.Description>
                        Haus Computer couldn’t set up computer use on {deviceName}. Update it, then
                        check again.
                    </Alert.Description>
                </Alert.Content>
            </Alert>
        );
    }
    if (readiness?.permissionsMoved) {
        return (
            <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Haus Computer is an app now, so macOS asks again</Alert.Title>
                </Alert.Content>
            </Alert>
        );
    }
    return null;
}

export function ComputerUsePermissionRows({
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
    const needsGrant = computerUseNeedsGrant(readiness);
    const recheck = useComputerUseRecheck({ active: needsGrant, computerId, serverId });
    const permissions = computerUsePermissions(readiness);
    if (permissions.length === 0) {
        return null;
    }
    if (!needsGrant) {
        return (
            <>
                <Separator />
                <ItemCard>
                    <ItemCard.Content>
                        <StatusInfoTitle
                            info={`Computer use needs ${permissions.map((permission) => permission.pane).join(' and ')}.`}
                            status={
                                <SettingsStatusChip color="success">Granted</SettingsStatusChip>
                            }
                        >
                            macOS permissions
                        </StatusInfoTitle>
                    </ItemCard.Content>
                </ItemCard>
            </>
        );
    }
    return (
        <>
            <Separator />
            <ItemCard>
                <ItemCard.Content>
                    <SettingsRowTitle info="Grant these on the device itself in System Settings › Privacy & Security.">
                        macOS permissions
                    </SettingsRowTitle>
                </ItemCard.Content>
                <ItemCard.Action>
                    <Button
                        isPending={recheck.isPending}
                        onPress={() => recheck.mutate({ computerId, serverId })}
                        size="sm"
                        variant="secondary"
                    >
                        Check again
                    </Button>
                </ItemCard.Action>
            </ItemCard>
            {permissions.map((permission) => (
                <Fragment key={permission.id}>
                    <Separator />
                    <PermissionRow permission={permission} />
                </Fragment>
            ))}
            <Separator />
            <AppPathRow
                appPath={readiness?.appPath ?? defaultComputerAppPath}
                deviceName={deviceName}
            />
        </>
    );
}

function PermissionRow({ permission }: { permission: ComputerUsePermission }) {
    const granted = permission.state === 'granted';
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsStatusTitle
                    status={
                        <SettingsStatusChip color={granted ? 'success' : 'warning'}>
                            {permissionStateLabel(permission.state)}
                        </SettingsStatusChip>
                    }
                >
                    {permission.pane}
                </SettingsStatusTitle>
                <ItemCard.Description className="whitespace-normal">
                    {granted ? permission.purpose : `${permission.purpose} ${permission.steps}`}
                </ItemCard.Description>
            </ItemCard.Content>
            {granted ? null : (
                <ItemCard.Action>
                    <Button
                        onPress={() => window.location.assign(permission.settingsUrl)}
                        size="sm"
                        variant="secondary"
                    >
                        Open Settings
                    </Button>
                </ItemCard.Action>
            )}
        </ItemCard>
    );
}

function AppPathRow({ appPath, deviceName }: { appPath: string; deviceName: string }) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>Haus Computer</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    Do this on {deviceName} itself, through Screen Sharing if it has no display. The
                    app is at {appPath}. In the file picker, press ⌘⇧G and paste the path.
                </ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <Button
                    onPress={() => {
                        writeClipboardText(appPath).then(
                            () => toast.success('Path copied'),
                            () => toast.danger('Could not copy the path')
                        );
                    }}
                    size="sm"
                    variant="secondary"
                >
                    <Icon icon={Copy01Icon} size={16} />
                    Copy path
                </Button>
            </ItemCard.Action>
        </ItemCard>
    );
}
