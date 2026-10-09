import { realtimeSubscription } from '../../realtime/subscription.ts';
import { reminderUpdatedTopic } from '../../realtime/topics.ts';

/** Owner/Admin only, the `requireReminderOperator` rule, rechecked per delivery. */
export const onReminderUpdatedProcedure = realtimeSubscription({
    authorize: {
        allows: (role) => role === 'owner' || role === 'admin',
        message: 'Only Owners and Admins can follow reminder changes.',
    },
    topic: reminderUpdatedTopic,
});
