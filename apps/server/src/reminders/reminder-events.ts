import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { reminderUpdatedTopic } from '../realtime/topics.ts';
import { prepareTaskLinkEvents, readReminderTaskIds } from '../tasks/task-reference-links.ts';

export type ReminderEventAction = 'canceled' | 'fired' | 'scheduled' | 'snoozed' | 'updated';

interface ReminderEventInput {
    action: ReminderEventAction;
    ownerAgentId: string;
    reminderId: string;
    serverId: string;
}

/**
 * Prepares `reminder.updated` for a reminder change about to commit. Owners and
 * Admins refetch the reminder reads; the event carries only ids.
 */
export function prepareReminderEvent(input: ReminderEventInput) {
    return reminderUpdatedTopic.prepare({
        action: input.action,
        ownerAgentId: input.ownerAgentId,
        reminderId: input.reminderId,
        serverId: input.serverId,
    });
}

/**
 * `reminder.updated` plus `task.updated` for every Task whose Reminders list this
 * change moved: those it references now, and `formerTaskIds`, the ones an edit
 * just unlinked. Read inside the transaction making the change.
 */
export async function prepareReminderEvents(
    db: Pick<HausDatabase, 'select'>,
    input: ReminderEventInput & { formerTaskIds?: readonly string[] }
): Promise<PreparedRealtimeEvent[]> {
    const { reminderId, serverId } = input;
    const taskIds = await readReminderTaskIds(db, { reminderIds: [reminderId], serverId });
    return [
        prepareReminderEvent(input),
        ...(await prepareTaskLinkEvents(db, {
            serverId,
            taskIds: [...(input.formerTaskIds ?? []), ...taskIds],
        })),
    ];
}
