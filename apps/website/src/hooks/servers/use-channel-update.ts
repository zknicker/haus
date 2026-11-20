import type { Chat } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

export function useChannelUpdate(target: Pick<Chat, 'isAll'>) {
    const utils = hausTrpc.useUtils();
    // The chat.lifecycle `updated` event owns list invalidation. Mention
    // options have no event coverage, so this mutation stays their owner.
    const onSuccess = ({ chat }: { chat: Chat }) => {
        void utils.chat.mentionOptions.invalidate({
            chatId: chat.id,
            serverId: chat.serverId,
        });
    };
    const project = hausTrpc.project.update.useMutation({ onSuccess });
    const everyone = hausTrpc.chat.updateAllChannel.useMutation({ onSuccess });

    return target.isAll ? everyone : project;
}
