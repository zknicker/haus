import type { ComputerUseRequest, ComputerUseRequests } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { useTargetedReadCoalescer } from '../../lib/targeted-read-coalescer.ts';
import { useChatLost } from '../realtime/use-chat-lost.ts';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';

const noRequests: readonly ComputerUseRequest[] = [];

export function useOpenComputerUseRequests(serverId: string, ownChatId: string | undefined) {
    const chatId = useChatLost(serverId, ownChatId) ? undefined : ownChatId;
    const coalescer = useTargetedReadCoalescer();
    const enabled = chatId !== undefined;
    const input = { chatId: chatId ?? '', serverId };
    const refresh = () => {
        if (chatId !== undefined) {
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.computerUse.requests, { chatId, serverId }),
            });
        }
    };
    const query = hausTrpc.computerUse.requests.useQuery(input, {
        ...queryPolicy.syncedSnapshot,
        enabled,
        select: selectOpenRequests,
    });

    const stream = useSubscriptionRestart(
        'computerUse.onRequestUpdated',
        serverId,
        refresh,
        `${serverId}:${chatId ?? ''}`,
        chatId
    );
    const { reset } = hausTrpc.computerUse.onRequestUpdated.useSubscription(input, {
        enabled: enabled && stream.open,
        onComplete: () => stream.completed(reset),
        onData: refresh,
        onError: (error) => stream.failed(error, reset),
        onStarted: stream.started,
    });

    return query.data ?? noRequests;
}

export function selectOpenRequests({ requests }: ComputerUseRequests) {
    const open = requests.filter((request) => request.state === 'requested');
    return open.length === 0 ? noRequests : open;
}
