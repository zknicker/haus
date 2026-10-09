import { createRouter } from '../trpc.ts';
import { cancelReminderProcedure } from './cancel.ts';
import { listReminderHistoryProcedure } from './history.ts';
import { listRemindersProcedure } from './list.ts';
import { onReminderUpdatedProcedure } from './on-updated.ts';
import { listReminderRunsProcedure } from './runs.ts';

export const reminderRouter = createRouter({
    cancel: cancelReminderProcedure,
    history: listReminderHistoryProcedure,
    list: listRemindersProcedure,
    onUpdated: onReminderUpdatedProcedure,
    runs: listReminderRunsProcedure,
});
