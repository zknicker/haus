import type { ReminderUpdatedEvent } from '@haus/api';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import {
    type TargetedReadCoalescer,
    useTargetedReadCoalescer,
} from '../../lib/targeted-read-coalescer.ts';
import { useSubscriptionRestart } from './use-subscription-restart.ts';

/**
 * `reminder.onUpdated` (Owners and Admins only; mount it only for them): the
 * owning Agent's reminders and history, and the reminder's runs.
 */
export function useReminderStream(serverId: string | undefined) {
    const coalescer = useTargetedReadCoalescer();
    const stream = useSubscriptionRestart('reminder.onUpdated', serverId, () => {
        if (serverId) {
            invalidateReminderReads(coalescer, { serverId });
        }
    });

    const { reset } = hausTrpc.reminder.onUpdated.useSubscription(
        { serverId: serverId ?? '' },
        {
            enabled: serverId !== undefined && stream.open,
            onComplete: () => stream.completed(reset),
            onData: (event) => applyReminderUpdate(coalescer, event),
            onError: (error) => stream.failed(error, reset),
            onStarted: stream.started,
        }
    );
}

export function applyReminderUpdate(coalescer: TargetedReadCoalescer, event: ReminderUpdatedEvent) {
    invalidateReminderReads(coalescer, {
        agentId: event.ownerAgentId,
        reminderId: event.reminderId,
        serverId: event.serverId,
    });
}

/** Without ids (recovery), every cached reminder read of the Server refreshes. */
function invalidateReminderReads(
    coalescer: TargetedReadCoalescer,
    { agentId, reminderId, serverId }: { agentId?: string; reminderId?: string; serverId: string }
) {
    const byAgent = agentId ? { agentId, serverId } : { serverId };
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.reminder.list, byAgent) });
    coalescer.invalidate({ queryKey: getQueryKey(hausTrpc.reminder.history, byAgent) });
    coalescer.invalidate({
        queryKey: getQueryKey(
            hausTrpc.reminder.runs,
            reminderId ? { reminderId, serverId } : { serverId }
        ),
    });
}
