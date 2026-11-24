import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { serverComputerRoute } from '../servers/server-routes.ts';
import { SettingsStatusChip, SettingsStatusTitle } from '../settings/layout/settings-row-title.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import { ComputerDiskChip } from './computer-disk-warning.tsx';
import { deviceIssue, deviceLastSeen, deviceMark } from './device-list-model.ts';
import { computerLabel } from './presentation.ts';

type Device = HausOutputs['computer']['list'][number];

export function DeviceRow({
    device,
    serverId,
    serverSlug,
}: {
    device: Device;
    serverId: string;
    serverSlug: string;
}) {
    const issue = deviceIssue(device);
    const lastSeen = deviceLastSeen(device);
    return (
        <ItemCard<'a'>
            className="relative w-full cursor-(--cursor-interactive) overflow-hidden text-left"
            render={(props) => <Link {...props} to={serverComputerRoute(serverSlug, device.id)} />}
        >
            <PressableFeedback.Highlight />
            <ItemCard.Icon>
                <Icon icon={deviceMark(device)} size={16} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <SettingsStatusTitle
                    status={
                        <>
                            {issue ? (
                                <SettingsStatusChip color={issue.color}>
                                    {issue.label}
                                </SettingsStatusChip>
                            ) : null}
                            <ComputerDiskChip computerId={device.id} serverId={serverId} />
                        </>
                    }
                >
                    {computerLabel(device)}
                </SettingsStatusTitle>
                {lastSeen ? <ItemCard.Description>{lastSeen}</ItemCard.Description> : null}
            </ItemCard.Content>
            <ItemCard.Action>
                <div className="flex items-center gap-2">
                    {device.productVersion ? (
                        <SettingsFact className="tabular-nums">
                            v{device.productVersion}
                        </SettingsFact>
                    ) : null}
                    <Icon
                        aria-hidden="true"
                        className="text-muted"
                        icon={ArrowRight01Icon}
                        size={16}
                    />
                </div>
            </ItemCard.Action>
        </ItemCard>
    );
}
