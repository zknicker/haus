import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Switch } from '@heroui/react';
import { useSetComputerUseEnabled } from '../../hooks/computer-use/use-computer-use-enabled.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import { ComputerUseCaptainsRow } from './computer-use-captains-row.tsx';
import { computerUseDescription, supportsComputerUse } from './computer-use-model.ts';
import { ComputerUsePermissions } from './computer-use-permissions.tsx';
import { ComputerUseStop } from './computer-use-stop.tsx';
import { computerLabel } from './presentation.ts';

export function ComputerUseAccessCard({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    if (!(computer && supportsComputerUse(computer))) {
        return null;
    }
    const deviceName = computerLabel(computer);
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Computer use</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ComputerUseStop
                    computerId={computerId}
                    deviceName={deviceName}
                    serverId={serverId}
                />
                <ItemCardGroup className="overflow-hidden">
                    <ComputerUseAccessRow
                        canChange={computer.canChangeComputerUse}
                        computerId={computerId}
                        enabled={computer.computerUseEnabled}
                        serverId={serverId}
                    />
                    {computer.computerUseEnabled ? (
                        <ComputerUseCaptainsRow
                            agents={computer.computerUseAgents}
                            canChange={computer.canChangeComputerUse}
                            computerId={computerId}
                            grantedAgentIds={computer.agentAccessGrants.map(
                                (grant) => grant.agentId
                            )}
                            serverId={serverId}
                        />
                    ) : null}
                </ItemCardGroup>
            </ItemCardGroup>
            {computer.computerUseEnabled ? (
                <ComputerUsePermissions
                    computerId={computerId}
                    deviceName={deviceName}
                    readiness={computer.reportedInventory?.computerUse}
                    serverId={serverId}
                />
            ) : null}
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
                <ItemCard.Title>Computer use allowed</ItemCard.Title>
                <ItemCard.Description className="whitespace-normal">
                    {computerUseDescription}
                </ItemCard.Description>
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
