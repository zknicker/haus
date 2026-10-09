import { createRouter } from '../trpc.ts';
import { cancelReminderProcedure } from './cancel.ts';
import { listReminderHistoryProcedure } from './history.ts';
import { listRemindersProcedure } from './list.ts';
import { onReminderEventProcedure } from './on-event.ts';
import { listReminderRunsProcedure } from './runs.ts';

export const reminderRouter = createRouter({
    cancel: cancelReminderProcedure,
    history: listReminderHistoryProcedure,
    list: listRemindersProcedure,
    onEvent: onReminderEventProcedure,
    runs: listReminderRunsProcedure,
});
