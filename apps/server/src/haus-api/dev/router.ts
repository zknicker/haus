import { createRouter } from '../trpc.ts';
import { cleanupEvalChatsRoute } from './cleanup-eval-chats.ts';
import { fireReminderNowRoute } from './fire-reminder-now.ts';

export const devRouter = createRouter({
    cleanupEvalChats: cleanupEvalChatsRoute,
    fireReminderNow: fireReminderNowRoute,
});
