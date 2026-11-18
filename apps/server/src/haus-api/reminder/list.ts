import { reminderListInputSchema, reminderListSchema } from '@haus/api';
import { listOperatorReminders } from '../../reminders/operator-reminders.ts';
import { reminderProcedure } from './procedure.ts';

export const listRemindersProcedure = reminderProcedure
    .input(reminderListInputSchema)
    .output(reminderListSchema)
    .query(async ({ ctx, input }) => listOperatorReminders(ctx.hausDb, ctx.member, input));
