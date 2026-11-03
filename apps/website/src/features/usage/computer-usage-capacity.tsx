import type { ComputerInventory, ComputerRuntimeId, ComputerUsage } from '@haus/api';
import { Card } from '@heroui/react';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useUsage } from '../../hooks/servers/use-usage.ts';
import { computerLabel } from '../computers/presentation.ts';
import { DetectedRuntimeUsage, DetectedRuntimeUsageSkeleton } from './detected-runtime-usage.tsx';

export function ComputerUsageCapacity({
    computerId,
    detectedRuntimeIds,
    serverId,
}: {
    computerId: string;
    detectedRuntimeIds: ComputerRuntimeId[];
    serverId: string;
}) {
    const usage = useUsage(serverId);
    const computers = useComputers(serverId);
    const host = computers.data?.find((item) => item.id === computerId);
    const computer = usage.data?.computers.find((item) => item.computerId === computerId);

    return (
        <ComputerUsageCapacityView
            computer={computer}
            computerName={host ? computerLabel(host) : 'this Computer'}
            detectedRuntimeIds={detectedRuntimeIds}
            error={usage.data ? undefined : usage.error?.message}
            isPending={!usage.data && usage.isPending}
            runtimeIssues={host?.reportedInventory?.runtimeIssues}
        />
    );
}

export function ComputerUsageCapacityView({
    computer,
    detectedRuntimeIds,
    error,
    isPending = false,
    runtimeIssues,
    computerName,
}: {
    computer: ComputerUsage | undefined;
    detectedRuntimeIds: ComputerRuntimeId[];
    error?: string;
    isPending?: boolean;
    runtimeIssues?: ComputerInventory['runtimeIssues'];
    computerName?: string;
}) {
    if (isPending) {
        return <DetectedRuntimeUsageSkeleton detectedRuntimeIds={detectedRuntimeIds} />;
    }
    if (error) {
        return <CapacityMessage description={error} title="Usage unavailable" />;
    }
    if (!computer?.usage) {
        return (
            <CapacityMessage
                description={
                    computer?.health === 'healthy'
                        ? 'This Computer has not completed its first usage report.'
                        : 'Reconnect this Computer to collect a usage report.'
                }
                title={computer?.health === 'healthy' ? 'Collecting usage' : 'Usage not reported'}
            />
        );
    }

    return (
        <DetectedRuntimeUsage
            computerName={computerName}
            detectedRuntimeIds={detectedRuntimeIds}
            runtimeIssues={runtimeIssues}
            usage={computer.usage}
        />
    );
}

function CapacityMessage({ description, title }: { description: string; title: string }) {
    return (
        <Card>
            <Card.Content>
                <p className="font-medium text-base">{title}</p>
                <p className="mt-1 text-muted text-sm">{description}</p>
            </Card.Content>
        </Card>
    );
}
