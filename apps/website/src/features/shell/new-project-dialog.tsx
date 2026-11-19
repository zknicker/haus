import { useNavigate } from 'react-router-dom';
import { useCreateServerChannel } from '../../hooks/servers/use-create-server-channel.ts';
import { ChannelCreateDialog } from '../chats/channel-create-dialog.tsx';
import { serverChatRoute } from '../servers/server-routes.ts';

export function NewProjectDialog({
    onClose,
    open,
    serverId,
    slug,
}: {
    onClose: () => void;
    open: boolean;
    serverId: string;
    slug: string;
}) {
    const navigate = useNavigate();
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
                navigate(serverChatRoute(slug, chat.id));
            }}
            open={open}
        />
    );
}
