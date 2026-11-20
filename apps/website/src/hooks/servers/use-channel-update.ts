import { hausTrpc } from '../../lib/haus-server.tsx';

export function useChannelUpdate() {
    const utils = hausTrpc.useUtils();

    return hausTrpc.project.update.useMutation({
        // The chat.lifecycle `updated` event owns list invalidation. Mention
        // options have no event coverage, so this mutation stays their owner.
        onSuccess: ({ chat }) => {
            void utils.chat.mentionOptions.invalidate({
                chatId: chat.id,
                serverId: chat.serverId,
            });
        },
    });
}
