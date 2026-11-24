import { Button, Description, Dropdown, Label, toast } from '@heroui/react';
import { MoreHorizontalIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useComputerInventoryRefresh } from '../../hooks/servers/use-computer-inventory-refresh.ts';
import { computerRemovalDescription, useComputerRemovalAvailability } from './computer-removal.ts';
import { type ComputerUpdateComputer, updateInput } from './computer-update-card.tsx';
import { computerUpdateView } from './computer-update-model.ts';
import { useComputerUpdateActions } from './use-computer-update-actions.ts';
import { useUpdateExpiryRefresh } from './use-update-expiry-refresh.ts';

export function ComputerActionsMenu({
    computer,
    isPreview,
    onRemove,
    serverId,
}: {
    computer: ComputerUpdateComputer;
    isPreview: boolean;
    onRemove: () => void;
    serverId: string;
}) {
    const availability = useComputerRemovalAvailability(serverId, computer.id);
    const update = useComputerUpdateActions({ computerId: computer.id, isPreview, serverId });
    useUpdateExpiryRefresh(computer);
    const view = computerUpdateView({ ...updateInput(computer), isChecking: update.isChecking });
    const canRemove = availability.status === 'ready';
    const refresh = useComputerInventoryRefresh();
    const reachable = computer.health !== 'offline' && computer.health !== 'update-required';

    return (
        <Dropdown>
            <Button aria-label="Device actions" isIconOnly size="sm" variant="ghost">
                <Icon aria-hidden="true" icon={MoreHorizontalIcon} size={16} />
            </Button>
            <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu>
                    <Dropdown.Item
                        id="refresh-status"
                        isDisabled={!reachable || refresh.isPending}
                        onAction={() =>
                            refresh.mutate(
                                { computerId: computer.id, serverId },
                                {
                                    onError: (error) =>
                                        toast.danger('Couldn’t refresh status', {
                                            description: error.message,
                                        }),
                                    onSuccess: () => toast.success('Status refreshed'),
                                }
                            )
                        }
                        textValue="Refresh status"
                    >
                        <Label>Refresh status</Label>
                    </Dropdown.Item>
                    <Dropdown.Item
                        id="check-update"
                        isDisabled={!view.canCheck}
                        onAction={() => void update.check()}
                        textValue="Check for updates"
                    >
                        <Label>Check for updates</Label>
                        {view.canCheck ? null : (
                            <Description>
                                {computer.health === 'offline'
                                    ? 'Reconnect this device to check for updates.'
                                    : view.label}
                            </Description>
                        )}
                    </Dropdown.Item>
                    {canRemove ? (
                        <Dropdown.Item
                            id="remove"
                            onAction={onRemove}
                            textValue="Remove device"
                            variant="danger"
                        >
                            <Label>Remove device</Label>
                        </Dropdown.Item>
                    ) : (
                        <Dropdown.Item id="remove" isDisabled textValue="Remove device">
                            <Label>Remove device</Label>
                            <Description>{computerRemovalDescription(availability)}</Description>
                        </Dropdown.Item>
                    )}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown>
    );
}
