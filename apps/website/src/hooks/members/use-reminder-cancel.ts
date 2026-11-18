import type { Reminder } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Canceling stops every future run. The Server checks `expectedVersion`, so a
 * reminder the Agent changed since this snapshot is refused rather than
 * canceled blind; `commandId` makes a retried press replay the first result.
 * No listener refreshes reminders yet, so the mutation owns the refresh — on
 * failure too: a recurring reminder bumps its version every run, so a refused
 * cancel must refetch or every retry repeats the same stale version.
 */
export function useReminderCancel(serverId: string, agentId: string) {
    const utils = hausTrpc.useUtils();
    const mutation = hausTrpc.reminder.cancel.useMutation({
        onSettled: async () =>
            await Promise.all([
                utils.reminder.history.invalidate({ agentId, serverId }),
                utils.reminder.list.invalidate({ agentId, serverId }),
            ]),
    });

    return {
        ...mutation,
        cancel: (reminder: Pick<Reminder, 'id' | 'version'>) =>
            mutation.mutateAsync({
                commandId: crypto.randomUUID(),
                expectedVersion: reminder.version,
                reminderId: reminder.id,
                serverId,
            }),
    };
}
