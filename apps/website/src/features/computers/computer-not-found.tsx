import { ComputerIcon } from '@hugeicons-pro/core-stroke-rounded';
import { useComputerStewards } from '../../hooks/computer-use/use-computer-stewards.ts';
import { SettingsEmptyState } from '../settings/layout/settings-empty.tsx';
import { SettingsPageColumn } from '../settings/layout/settings-page-column.tsx';

export function ComputerNotFound({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const stewards = useComputerStewards(serverId, computerId);
    const steward = stewards.data;
    if (!steward && stewards.isPending) {
        return null;
    }
    return (
        <SettingsPageColumn width="table">
            {steward ? (
                <SettingsEmptyState
                    description={`${
                        steward.attacher.handle
                            ? `@${steward.attacher.handle}`
                            : steward.attacher.displayName
                    }, who attached it, or an Owner or Admin can change its settings, including computer use.`}
                    icon={ComputerIcon}
                    title={`${steward.name ?? 'This device'} isn’t yours to change`}
                />
            ) : (
                <SettingsEmptyState
                    description="This device is no longer attached to the Server. Choose an attached device from Devices; Haus will not redirect you to another machine."
                    icon={ComputerIcon}
                    title="Device unavailable"
                />
            )}
        </SettingsPageColumn>
    );
}
