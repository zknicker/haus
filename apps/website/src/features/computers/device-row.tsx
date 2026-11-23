import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import { Badge } from '@heroui/react';
import { ArrowRight01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { serverComputerRoute } from '../servers/server-routes.ts';
import { SettingsStatusTitle } from '../settings/layout/settings-row-title.tsx';
import { SettingsFact } from '../settings/layout/settings-text.tsx';
import { ComputerDiskChip } from './computer-disk-warning.tsx';
import { deviceMark, deviceStatusLine } from './device-list-model.ts';
import { computerHealthColor, computerLabel } from './presentation.ts';

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
                    status={<ComputerDiskChip computerId={device.id} serverId={serverId} />}
                >
                    {computerLabel(device)}
                </SettingsStatusTitle>
                <ItemCard.Description>
                    <span className="inline-flex items-center gap-1.5">
                        <Badge
                            className="static transform-none"
                            color={computerHealthColor(device.health)}
                            size="sm"
                        />
                        {deviceStatusLine(device)}
                    </span>
                </ItemCard.Description>
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
