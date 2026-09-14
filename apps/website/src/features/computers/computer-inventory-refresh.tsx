import { Button, Spinner, Tooltip, toast } from '@heroui/react';
import { ArrowReloadHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
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
        <Tooltip delay={0}>
            <Button
                aria-label="Refresh runtimes"
                isDisabled={
                    !computer ||
                    computer.health === 'offline' ||
                    computer.health === 'update-required'
                }
                isIconOnly
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
                {({ isPending }) =>
                    isPending ? (
                        <Spinner color="current" size="sm" />
                    ) : (
                        <Icon icon={ArrowReloadHorizontalIcon} size={16} />
                    )
                }
            </Button>
            <Tooltip.Content>Refresh runtimes</Tooltip.Content>
        </Tooltip>
    );
}
