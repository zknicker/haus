import { Alert, Chip } from '@heroui/react';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { computerDiskWarning, computerDiskWarningDescription } from './computer-disk.ts';

export function ComputerDiskWarning({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const warning = useDiskWarning(computerId, serverId);
    if (!warning) {
        return null;
    }
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>Low disk space · {warning.label}</Alert.Title>
                <Alert.Description>{computerDiskWarningDescription}</Alert.Description>
            </Alert.Content>
        </Alert>
    );
}

export function ComputerDiskChip({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const warning = useDiskWarning(computerId, serverId);
    if (!warning) {
        return null;
    }
    return (
        <Chip color="warning" size="sm" title={warning.label} variant="soft">
            <Chip.Label>Low disk</Chip.Label>
        </Chip>
    );
}

function useDiskWarning(computerId: string, serverId: string) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((item) => item.id === computerId);
    return computer ? computerDiskWarning(computer) : null;
}
