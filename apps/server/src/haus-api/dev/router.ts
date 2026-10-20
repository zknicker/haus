import { createRouter } from '../trpc.ts';
import { cleanupEvalChatsRoute } from './cleanup-eval-chats.ts';
import { createClerkSignInTokenRoute } from './create-clerk-sign-in-token.ts';
import {
    heartbeatEvidenceRoute,
    seedHeartbeatMessagesRoute,
    setOperatorTimezoneRoute,
    startHeartbeatRoute,
} from './heartbeat-test-routes.ts';

export const devRouter = createRouter({
    cleanupEvalChats: cleanupEvalChatsRoute,
    createClerkSignInToken: createClerkSignInTokenRoute,
    heartbeatEvidence: heartbeatEvidenceRoute,
    seedHeartbeatMessages: seedHeartbeatMessagesRoute,
    setOperatorTimezone: setOperatorTimezoneRoute,
    startHeartbeat: startHeartbeatRoute,
});
