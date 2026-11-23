import type { ComputerUseReadiness } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Button, toast } from '@heroui/react';
import { Copy01Icon, Image01Icon, Mouse01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputerUseRecheck } from '../../hooks/computer-use/use-computer-use-recheck.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { SettingsStatusChip, SettingsStatusTitle } from '../settings/layout/settings-row-title.tsx';
import {
    type ComputerUsePermission,
    computerUseNeedsGrant,
    computerUsePermissions,
    defaultComputerAppPath,
    permissionStateLabel,
} from './computer-use-model.ts';

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
    const needsGrant = computerUseNeedsGrant(readiness);
    const recheck = useComputerUseRecheck({ active: needsGrant, computerId, serverId });
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
    const permissions = computerUsePermissions(readiness);
    if (permissions.length === 0) {
        return null;
    }
    const appPath = readiness?.appPath ?? defaultComputerAppPath;
    return (
        <ItemCardGroup variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>macOS permissions</ItemCardGroup.Title>
                {needsGrant ? (
                    <Button
                        isPending={recheck.isPending}
                        onPress={() => recheck.mutate({ computerId, serverId })}
                        size="sm"
                        variant="ghost"
                    >
                        Check again
                    </Button>
                ) : null}
            </ItemCardGroup.Header>
            {readiness?.permissionsMoved ? (
                <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Haus Computer is an app now, so macOS asks again</Alert.Title>
                    </Alert.Content>
                </Alert>
            ) : null}
            <ItemCardGroup>
                {permissions.map((permission) => (
                    <PermissionRow key={permission.id} permission={permission} />
                ))}
                {needsGrant ? <AppPathRow appPath={appPath} deviceName={deviceName} /> : null}
            </ItemCardGroup>
        </ItemCardGroup>
    );
}

function PermissionRow({ permission }: { permission: ComputerUsePermission }) {
    const granted = permission.state === 'granted';
    return (
        <ItemCard>
            <ItemCard.Icon>
                <Icon
                    icon={permission.id === 'accessibility' ? Mouse01Icon : Image01Icon}
                    size={16}
                />
            </ItemCard.Icon>
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
                        variant="outline"
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
                    variant="ghost"
                >
                    <Icon icon={Copy01Icon} size={16} />
                    Copy path
                </Button>
            </ItemCard.Action>
        </ItemCard>
    );
}
