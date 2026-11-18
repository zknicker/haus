import type { CloudAgentWorkUpdatedEvent } from '@haus/api';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { refreshTaskReads } from './task-reads.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `cloudAgentWork.onUpdated`: the Server publishes one event per linking
 * Message (ADR 0044), so each event refreshes that Message's entity (its card
 * states the status), the work list of its Chat, and
 * the active-work list behind the Inbox, and the detail and preview of the Task
 * the event names (`taskId`). A start also rereads every Task detail.
 */
export function useCloudAgentWorkStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const queryClient = useQueryClient();
    const stream = useSubscriptionRestart('cloudAgentWork.onUpdated', serverId, () => {
        if (serverId) {
            coalescer.recoverTranscriptLists({ serverId });
            coalescer.invalidate({
                queryKey: getQueryKey(hausTrpc.cloudAgentWork.listForChat, { serverId }),
            });
            invalidateActiveWork(coalescer, serverId);
            coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
        }
    });

    const { reset } = hausTrpc.cloudAgentWork.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyCloudAgentWorkUpdate(coalescer, queryClient, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyCloudAgentWorkUpdate(
    coalescer: TargetedReadCoalescer,
    queryClient: QueryClient,
    event: CloudAgentWorkUpdatedEvent
) {
    const { chatId, messageId, serverId, taskId } = event;
    // The Task page's attached-work panel states the work too (ADR 0053 decision 12).
    if (taskId) {
        refreshTaskReads(coalescer, queryClient, { serverId, taskId });
    }
    coalescer.noteMessageAnnotated({ chatId, messageId, serverId });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listForChat, { chatId, serverId }),
    });
    invalidateActiveWork(coalescer, serverId);
}

function invalidateActiveWork(coalescer: TargetedReadCoalescer, serverId: string) {
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listLinks, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listAutomations, { serverId }),
    });
    coalescer.invalidate({
        queryKey: getQueryKey(hausTrpc.cloudAgentWork.listActive, { serverId }),
    });
}
