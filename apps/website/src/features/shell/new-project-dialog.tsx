import { useCreateServerChannel } from '../../hooks/servers/use-create-server-channel.ts';
import { ChannelCreateDialog } from '../chats/channel-create-dialog.tsx';

export function NewProjectDialog({
    onClose,
    onCreated,
    open,
    serverId,
}: {
    onClose: () => void;
    onCreated: (chatId: string) => void;
    open: boolean;
    serverId: string;
}) {
    const createChannel = useCreateServerChannel();
    const close = () => {
        createChannel.reset();
        onClose();
    };

    return (
        <ChannelCreateDialog
            errorMessage={createChannel.error?.message ?? null}
            isPending={createChannel.isPending}
            onClose={close}
            onSubmit={async ({ color, icon, name }) => {
                const { chat } = await createChannel.mutateAsync({ color, icon, name, serverId });
                close();
                onCreated(chat.id);
            }}
            open={open}
        />
    );
}
