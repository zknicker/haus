import { reminderUpdatedTopic } from '../realtime/topics.ts';

export type ReminderEventAction = 'canceled' | 'fired' | 'scheduled' | 'snoozed' | 'updated';

/**
 * Prepares `reminder.updated` for a reminder change about to commit. Owners and
 * Admins refetch the reminder reads; the event carries only ids.
 */
export function prepareReminderEvent(input: {
    action: ReminderEventAction;
    ownerAgentId: string;
    reminderId: string;
    serverId: string;
}) {
    return reminderUpdatedTopic.prepare({
        action: input.action,
        ownerAgentId: input.ownerAgentId,
        reminderId: input.reminderId,
        serverId: input.serverId,
    });
}
