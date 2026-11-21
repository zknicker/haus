import { toast } from '@heroui/react';
import { hausTrpc } from '../../lib/haus-server.tsx';

export function useComputerUseDecide(serverId: string, chatId: string) {
    const utils = hausTrpc.useUtils();
    return hausTrpc.computerUse.decide.useMutation({
        onError: (error) => {
            toast.danger('Couldn’t answer the request', { description: error.message });
        },
        onSettled: () => {
            void utils.computerUse.requests.invalidate({ chatId, serverId });
        },
    });
}
