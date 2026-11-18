import { reminderRunsInputSchema, reminderRunsSchema } from '@haus/api';
import { listOperatorReminderRuns } from '../../reminders/operator-reminders.ts';
import { reminderProcedure } from './procedure.ts';

export const listReminderRunsProcedure = reminderProcedure
    .input(reminderRunsInputSchema)
    .output(reminderRunsSchema)
    .query(async ({ ctx, input }) => listOperatorReminderRuns(ctx.hausDb, ctx.member, input));
