import { useComputerRemove } from '../../hooks/servers/use-computer-remove.ts';
import { DeleteDialog } from '../../routes/app/delete-dialog.tsx';

export function ComputerRemoveDialog({
    computerId,
    onOpenChange,
    serverId,
}: {
    computerId: string;
    onOpenChange: (open: boolean) => void;
    serverId: string;
}) {
    const remove = useComputerRemove(serverId, () => onOpenChange(false));

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
