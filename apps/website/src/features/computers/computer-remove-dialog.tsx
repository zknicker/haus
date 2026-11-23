import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Separator } from '@heroui/react';
import * as React from 'react';
import { useComputerRemove } from '../../hooks/servers/use-computer-remove.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { DeleteDialog } from '../../routes/app/delete-dialog.tsx';
import { type RemovalCaptain, useComputerRemovalAvailability } from './computer-removal.ts';
import { type MachineOption, machineOptions } from './machine-model.ts';
import { MachineSelect } from './machine-select.tsx';

export function ComputerRemoveDialog({
    computerId,
    onOpenChange,
    onRemoved,
    serverId,
}: {
    computerId: string;
    onOpenChange: (open: boolean) => void;
    onRemoved: () => void;
    serverId: string;
}) {
    const remove = useComputerRemove(serverId, onRemoved);
    const availability = useComputerRemovalAvailability(serverId, computerId);
    const computers = useComputers(serverId);
    const [chosen, setChosen] = React.useState<Record<string, string>>({});
    const captains = availability.status === 'ready' ? availability.captains : [];
    const destinations = (captain: RemovalCaptain) =>
        machineOptions({
            agentId: captain.id,
            currentId: computerId,
            devices: computers.data ?? [],
        }).filter((option) => option.id !== computerId);
    const moves = captains.flatMap((captain) => {
        const computer = chosen[captain.id] ?? destinations(captain)[0]?.id;
        return computer ? [{ agentId: captain.id, computerId: computer }] : [];
    });

    return (
        <DeleteDialog
            canConfirm={availability.status === 'ready' && moves.length === captains.length}
            confirmation="REMOVE"
            description={
                captains.length > 0
                    ? 'This immediately revokes this device’s credential and removes it from the Server. Its Captains move to the Machines below from their last synced Drive; worktrees and anything not pushed stay on this device.'
                    : 'This immediately revokes this device’s credential and removes it from the Server.'
            }
            error={remove.error?.message}
            onConfirm={() =>
                remove.mutate({ computerId, confirmation: 'REMOVE', machineMoves: moves, serverId })
            }
            onOpenChange={onOpenChange}
            pending={remove.isPending}
            title="Remove device"
        >
            {captains.length > 0 ? (
                <ItemCardGroup variant="transparent">
                    <ItemCardGroup.Header>
                        <ItemCardGroup.Title>Change machine</ItemCardGroup.Title>
                    </ItemCardGroup.Header>
                    <ItemCardGroup>
                        {captains.map((captain, index) => (
                            <React.Fragment key={captain.id}>
                                {index > 0 ? <Separator /> : null}
                                <MoveRow
                                    captain={captain}
                                    onChange={(id) =>
                                        setChosen((current) => ({ ...current, [captain.id]: id }))
                                    }
                                    options={destinations(captain)}
                                    value={
                                        moves.find((move) => move.agentId === captain.id)
                                            ?.computerId
                                    }
                                />
                            </React.Fragment>
                        ))}
                    </ItemCardGroup>
                </ItemCardGroup>
            ) : null}
        </DeleteDialog>
    );
}

function MoveRow({
    captain,
    onChange,
    options,
    value,
}: {
    captain: RemovalCaptain;
    onChange: (id: string) => void;
    options: readonly MachineOption[];
    value: string | undefined;
}) {
    return (
        <ItemCard>
            <ItemCard.Content>
                <ItemCard.Title>{captain.displayName}</ItemCard.Title>
                {options.length === 0 ? (
                    <ItemCard.Description className="whitespace-normal">
                        No other device allows {captain.displayName}. Give it access to one first.
                    </ItemCard.Description>
                ) : null}
            </ItemCard.Content>
            {options.length > 0 ? (
                <ItemCard.Action>
                    <MachineSelect
                        className="w-48"
                        label={`New Machine for ${captain.displayName}`}
                        onSelect={onChange}
                        options={options}
                        value={value ?? null}
                    />
                </ItemCard.Action>
            ) : null}
        </ItemCard>
    );
}
