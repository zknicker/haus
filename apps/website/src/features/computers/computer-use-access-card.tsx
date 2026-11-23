import { ItemCard } from '@heroui-pro/react';
import { Separator, Switch } from '@heroui/react';
import { useSetComputerUseEnabled } from '../../hooks/computer-use/use-computer-use-enabled.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import type { HausOutputs } from '../../lib/haus-server.tsx';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { SettingsRowTitle } from '../settings/layout/settings-row-title.tsx';
import { ComputerUseCaptainsRow } from './computer-use-captains-row.tsx';
import { computerUseDescription, supportsComputerUse } from './computer-use-model.ts';
import { ComputerUsePermissions } from './computer-use-permissions.tsx';
import { computerLabel } from './presentation.ts';

type AccessComputer = HausOutputs['computer']['list'][number];

/** Computer use's rows in the Access card: the switch, then which Captains while it is on. */
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
                </>
            ) : null}
        </>
    );
}

/** macOS permissions, its own section right after Access, while computer use is on. */
export function ComputerUsePermissionsSection({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    if (!(computer && supportsComputerUse(computer) && computer.computerUseEnabled)) {
        return null;
    }
    return (
        <section>
            <ComputerUsePermissions
                computerId={computerId}
                deviceName={computerLabel(computer)}
                readiness={computer.reportedInventory?.computerUse}
                serverId={serverId}
            />
        </section>
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
                <SettingsRowTitle info={computerUseDescription}>
                    Computer use allowed
                </SettingsRowTitle>
            </ItemCard.Content>
            <ItemCard.Action>
                <Switch
                    aria-label="Computer use allowed"
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
