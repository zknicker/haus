import { ItemCard } from '@heroui-pro/react';
import { Separator, Switch } from '@heroui/react';
import { useSetComputerUseEnabled } from '../../hooks/computer-use/use-computer-use-enabled.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import { ComputerUseCaptainsRow } from './computer-use-captains-row.tsx';
import { computerUseDescription } from './computer-use-model.ts';
import { ComputerUsePermissionRows } from './computer-use-permissions.tsx';
import { computerLabel } from './presentation.ts';

type AccessComputer = HausOutputs['computer']['list'][number];

export function ComputerUseRows({
    computer,
    serverId,
}: {
    computer: AccessComputer;
    serverId: string;
}) {
    return (
        <>
            <ComputerUseAccessRow
                canChange={computer.canChangeComputerUse}
                computerId={computer.id}
                enabled={computer.computerUseEnabled}
                serverId={serverId}
            />
            {computer.computerUseEnabled ? (
                <>
                    <Separator />
                    <ComputerUseCaptainsRow
                        agents={computer.computerUseAgents}
                        canChange={computer.canChangeComputerUse}
                        computerId={computer.id}
                        grantedAgentIds={computer.agentAccessGrants.map((grant) => grant.agentId)}
                        serverId={serverId}
                    />
                    <ComputerUsePermissionRows
                        computerId={computer.id}
                        deviceName={computerLabel(computer)}
                        readiness={computer.reportedInventory?.computerUse}
                        serverId={serverId}
                    />
                </>
            ) : null}
        </>
    );
}

export function ComputerUseAccessRow({
    canChange,
    computerId,
    enabled,
    serverId,
}: {
    canChange: boolean;
    computerId: string;
    enabled: boolean;
    serverId: string;
}) {
    const setEnabled = useSetComputerUseEnabled(serverId);
    return (
        <ItemCard>
            <ItemCard.Content>
                <SettingsRowTitle info={computerUseDescription}>Computer use</SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <Switch
                    aria-label="Computer use"
                    isDisabled={!canChange || setEnabled.isPending}
                    isSelected={enabled}
                    onChange={(next) => {
                        withSaveErrorToast(() =>
                            setEnabled.mutateAsync({ computerId, enabled: next, serverId })
                        ).catch(() => undefined);
                    }}
                >
                    <Switch.Content>
                        <Switch.Control>
                            <Switch.Thumb />
                        </Switch.Control>
                    </Switch.Content>
                </Switch>
            </ItemCard.Action>
        </ItemCard>
    );
}
