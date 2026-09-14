import { Button, toast } from '@heroui/react';
import { useComputerInventoryRefresh } from '../../hooks/servers/use-computer-inventory-refresh.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';

export function ComputerInventoryRefresh({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const computer = computers.data?.find((candidate) => candidate.id === computerId);
    const refresh = useComputerInventoryRefresh();
    return (
        <Button
            aria-label="Refresh runtimes"
            isDisabled={
                !computer || computer.health === 'offline' || computer.health === 'update-required'
            }
            isPending={refresh.isPending}
            onPress={() =>
                refresh.mutate(
                    { computerId, serverId },
                    {
                        onError: (error) =>
                            toast.danger('Could not refresh runtimes', {
                                description: error.message,
                            }),
                        onSuccess: () => toast.success('Runtimes refreshed'),
                    }
                )
            }
            size="sm"
            variant="ghost"
        >
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
        </Button>
    );
}
