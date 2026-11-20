import { useComputerRemove } from '../../hooks/servers/use-computer-remove.ts';
import { DeleteDialog } from '../../routes/app/delete-dialog.tsx';

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

    return (
        <DeleteDialog
            confirmation="REMOVE"
            description="This immediately revokes this device’s credential and removes it from the Server."
            error={remove.error?.message}
            onConfirm={() =>
                remove.mutate({
                    computerId,
                    confirmation: 'REMOVE',
                    serverId,
                })
            }
            onOpenChange={onOpenChange}
            pending={remove.isPending}
            title="Remove device"
        />
    );
}
