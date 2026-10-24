import { createRouter } from '../trpc.ts';
import { cleanupEvalChatsRoute } from './cleanup-eval-chats.ts';
import { createClerkSignInTokenRoute } from './create-clerk-sign-in-token.ts';
import { fireReminderNowRoute } from './fire-reminder-now.ts';
import {
    heartbeatEvidenceRoute,
    seedHeartbeatMessagesRoute,
    setOperatorTimezoneRoute,
    startHeartbeatRoute,
} from './heartbeat-test-routes.ts';
import { seedHeartbeatsRoute } from './seed-heartbeats.ts';

export const devRouter = createRouter({
    cleanupEvalChats: cleanupEvalChatsRoute,
    createClerkSignInToken: createClerkSignInTokenRoute,
    fireReminderNow: fireReminderNowRoute,
    heartbeatEvidence: heartbeatEvidenceRoute,
    seedHeartbeatMessages: seedHeartbeatMessagesRoute,
    seedHeartbeats: seedHeartbeatsRoute,
    setOperatorTimezone: setOperatorTimezoneRoute,
    startHeartbeat: startHeartbeatRoute,
});
