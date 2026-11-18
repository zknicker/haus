import { reminderCancelInputSchema, reminderMutationResultSchema } from '@haus/api';
import { cancelOperatorReminder } from '../../reminders/operator-reminders.ts';
import { reminderProcedure } from './procedure.ts';

export const cancelReminderProcedure = reminderProcedure
    .input(reminderCancelInputSchema)
    .output(reminderMutationResultSchema)
    .mutation(async ({ ctx, input }) =>
        cancelOperatorReminder(ctx.hausDb, ctx.member, input, {
            now: () => new Date(),
        })
    );
