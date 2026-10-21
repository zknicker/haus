import type { CloudAgentWorkUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `cloudAgentWork.onUpdated`: the Server publishes one event per linking
 * Message (ADR 0044), so each event refreshes that Message's entity (its card
 * states the status), the work list of its Chat and of a Thread's parent, and
 * the active-work list behind the Inbox.
 */
export function useCloudAgentWorkStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('cloudAgentWork.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.cloudAgentWork.listForChat, { serverId }),
            });
            invalidateActiveWork(coalescer, serverId);
        }
    });

    const { reset } = hausTrpc.cloudAgentWork.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyCloudAgentWorkUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyCloudAgentWorkUpdate(
    coalescer: TargetedReadCoalescer,
    event: CloudAgentWorkUpdatedEvent
) {
    const { chatId, messageId, parentChatId, serverId } = event;
    coalescer.noteMessageAnnotated({ chatId, messageId, serverId });
    for (const workChatId of parentChatId ? [chatId, parentChatId] : [chatId]) {
        coalescer.invalidate({
            queryKey: getQueryKey(hausTrpc.cloudAgentWork.listForChat, {
                chatId: workChatId,
                serverId,
            }),
        });
    }
    invalidateActiveWork(coalescer, serverId);
}

function invalidateActiveWork(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listAutomations, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listActive, { serverId }),
    });
}
