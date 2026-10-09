import { canManageServerInvitations } from '@haus/api';
import { realtimeSubscription } from '../../realtime/subscription.ts';
import { invitationUpdatedTopic } from '../../realtime/topics.ts';

/** Owner/Admin only, the same authority as `invitation.list`. */
export const onInvitationUpdatedProcedure = realtimeSubscription({
    authorize: {
        allows: canManageServerInvitations,
        message: 'Only Owners and Admins can follow invitation changes.',
    },
    topic: invitationUpdatedTopic,
});
