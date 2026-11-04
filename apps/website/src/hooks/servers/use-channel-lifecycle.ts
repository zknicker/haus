import { hausTrpc } from '../../lib/haus-server.tsx';

function useLifecycleInvalidation() {
    const utils = hausTrpc.useUtils();
    return async (serverId: string, chatId: string) => {
        await Promise.all([
            utils.chat.get.invalidate({ chatId, serverId }),
            utils.chat.list.invalidate({ serverId }),
            utils.chat.listArchived.invalidate({ serverId }),
            utils.chat.search.invalidate({ serverId }),
            utils.claim.list.invalidate({ serverId }, { refetchType: 'all' }),
        ]);
    };
}

export function useChannelArchive() {
    const invalidate = useLifecycleInvalidation();
    return hausTrpc.chat.archiveChannel.useMutation({
        onSuccess: async (receipt) => await invalidate(receipt.serverId, receipt.chatId),
    });
}

export function useChannelUnarchive() {
    const invalidate = useLifecycleInvalidation();
    return hausTrpc.chat.unarchiveChannel.useMutation({
        onSuccess: async (receipt) => await invalidate(receipt.serverId, receipt.chatId),
    });
}

export function useChannelDelete() {
    const invalidate = useLifecycleInvalidation();
    return hausTrpc.chat.deleteChannel.useMutation({
        onSettled: async (_receipt, _error, input) =>
            await invalidate(input.serverId, input.chatId),
    });
}
