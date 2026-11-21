import type { ComputerUseReadiness } from '@haus/api';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Alert, Switch } from '@heroui/react';
import { useSetComputerUseEnabled } from '../../hooks/computer-use/use-computer-use-enabled.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { withSaveErrorToast } from '../../lib/saving-toast.ts';
import {
    computerUseDescription,
    computerUseReadinessIssues,
    computerUseReadinessText,
    supportsComputerUse,
} from './computer-use-model.ts';

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
    return (
        <section>
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>Access</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                {computer.computerUseEnabled ? (
                    <ComputerUseReadinessWarning
                        readiness={computer.reportedInventory?.computerUse}
                    />
                ) : null}
                <ItemCardGroup className="overflow-hidden">
                    <ComputerUseAccessRow
                        canChange={computer.canChangeComputerUse}
                        computerId={computerId}
                        enabled={computer.computerUseEnabled}
                        serverId={serverId}
                    />
                </ItemCardGroup>
            </ItemCardGroup>
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

export function ComputerUseReadinessWarning({
    readiness,
}: {
    readiness: ComputerUseReadiness | undefined;
}) {
    const issues = computerUseReadinessIssues(readiness);
    if (issues.length === 0) {
        return null;
    }
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Computer use isn’t ready</Alert.Title>
                {issues.map((issue) => (
                    <Alert.Description key={issue.kind === 'install' ? issue.kind : issue.pane}>
                        {computerUseReadinessText(issue)}
                    </Alert.Description>
                ))}
            </Alert.Content>
        </Alert>
    );
}
